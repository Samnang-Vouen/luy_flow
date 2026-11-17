import {
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { LessThan, Repository } from 'typeorm';
import { AuthService } from '../auth/auth.service';
import { hashToken } from '../auth/utils/hash.util';
import { UsersService } from '../users/users.service';
import { OAuthCode } from './entities/oauth-code.entity';

/** The validated query (GET) or form fields (POST) of /oauth/authorize. */
export interface AuthorizeParams {
  response_type: 'code';
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: 'S256';
  state?: string;
  scope?: string;
}

export type AuthorizeCheck =
  /** Unknown client or redirect URI: show an error page, never redirect. */
  | { kind: 'invalid'; message: string }
  /** Known client, but a bad request: send the user back with ?error=. */
  | { kind: 'redirect'; url: string }
  | { kind: 'ok'; params: AuthorizeParams };

interface OAuthClient {
  id: string;
  secret: string;
  redirectUri: string;
  name: string;
}

/** Standard OAuth error body: { error, error_description }. */
export class OAuthError extends HttpException {
  constructor(error: string, description: string, status = HttpStatus.BAD_REQUEST) {
    super({ error, error_description: description }, status);
  }
}

const CODE_TTL_MS = 10 * 60 * 1000;
/** Shown in the user's session list, so they can see and end TripSplit's access. */
export const OAUTH_SESSION_LABEL = (clientName: string) => `${clientName} (OAuth)`;

const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/; // base64url of a SHA-256 digest
const CODE_VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/; // RFC 7636 section 4.1

const str = (value: unknown, max = 2000): string | undefined =>
  typeof value === 'string' && value.length > 0 && value.length <= max
    ? value
    : undefined;

/** Constant-time comparison that also hides the length of the secret. */
const sameSecret = (a: string, b: string) =>
  timingSafeEqual(
    createHash('sha256').update(a).digest(),
    createHash('sha256').update(b).digest(),
  );

@Injectable()
export class OAuthService {
  constructor(
    @InjectRepository(OAuthCode)
    private readonly codes: Repository<OAuthCode>,
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly config: ConfigService,
  ) {}

  /** The one registered client (TripSplit), from .env. Null when OAuth isn't configured. */
  get client(): OAuthClient | null {
    const id = this.config.get<string>('OAUTH_CLIENT_ID');
    const secret = this.config.get<string>('OAUTH_CLIENT_SECRET');
    const redirectUri = this.config.get<string>('OAUTH_REDIRECT_URI');
    if (!id || !secret || !redirectUri) return null;
    return {
      id,
      secret,
      redirectUri,
      name: this.config.get<string>('OAUTH_CLIENT_NAME') || 'TripSplit',
    };
  }

  // ---- /oauth/authorize ----

  checkAuthorizeRequest(input: Record<string, unknown>): AuthorizeCheck {
    const client = this.client;
    if (!client) {
      return { kind: 'invalid', message: 'OAuth is not configured on this server.' };
    }
    // Only an exact match is trusted; anything else must not receive a redirect.
    if (str(input.client_id) !== client.id || str(input.redirect_uri) !== client.redirectUri) {
      return { kind: 'invalid', message: 'Unknown app or return address.' };
    }

    const state = input.state === undefined ? undefined : str(input.state, 1000);
    const scope = input.scope === undefined ? undefined : str(input.scope, 200);
    const back = (error: string, description: string) => ({
      kind: 'redirect' as const,
      url: this.errorRedirect(client.redirectUri, error, description, state),
    });

    if (input.response_type !== 'code') {
      return back('unsupported_response_type', 'response_type must be code');
    }
    if (input.code_challenge_method !== 'S256' || !S256_CHALLENGE.test(String(input.code_challenge ?? ''))) {
      return back('invalid_request', 'PKCE with code_challenge_method=S256 is required');
    }
    if ((input.state !== undefined && !state) || (input.scope !== undefined && !scope)) {
      return back('invalid_request', 'state or scope is invalid');
    }

    return {
      kind: 'ok',
      params: {
        response_type: 'code',
        client_id: client.id,
        redirect_uri: client.redirectUri,
        code_challenge: input.code_challenge as string,
        code_challenge_method: 'S256',
        ...(state !== undefined && { state }),
        ...(scope !== undefined && { scope }),
      },
    };
  }

  /** Stores a new one-time code for this user and returns the URL to send the browser to. */
  async approve(userId: string, params: AuthorizeParams): Promise<string> {
    const code = randomBytes(32).toString('base64url');
    // Opportunistic cleanup of codes nobody exchanged.
    await this.codes.delete({ expiresAt: LessThan(new Date()) });
    await this.codes.insert({
      codeHash: hashToken(code),
      clientId: params.client_id,
      userId,
      redirectUri: params.redirect_uri,
      codeChallenge: params.code_challenge,
      scope: params.scope ?? null,
      expiresAt: new Date(Date.now() + CODE_TTL_MS),
    });
    const url = new URL(params.redirect_uri);
    url.searchParams.set('code', code);
    if (params.state !== undefined) url.searchParams.set('state', params.state);
    return url.toString();
  }

  /** The URL that tells the client the user tapped Deny. */
  deny(params: AuthorizeParams): string {
    return this.errorRedirect(params.redirect_uri, 'access_denied', 'The user denied access', params.state);
  }

  private errorRedirect(redirectUri: string, error: string, description: string, state?: string) {
    const url = new URL(redirectUri);
    url.searchParams.set('error', error);
    url.searchParams.set('error_description', description);
    if (state !== undefined) url.searchParams.set('state', state);
    return url.toString();
  }

  // ---- /oauth/token ----

  async token(
    body: Record<string, unknown>,
    authorization: string | undefined,
    ipAddress?: string,
  ) {
    const client = this.authenticateClient(body, authorization);

    if (body.grant_type === 'authorization_code') {
      return this.exchangeCode(client, body, ipAddress);
    }
    if (body.grant_type === 'refresh_token') {
      const refreshToken = str(body.refresh_token);
      if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required');
      try {
        const tokens = await this.authService.refresh(
          refreshToken,
          OAUTH_SESSION_LABEL(client.name),
          ipAddress,
        );
        return this.tokenResponse(tokens);
      } catch (err) {
        if (err instanceof UnauthorizedException) {
          throw new OAuthError('invalid_grant', 'The refresh token is invalid, expired or revoked');
        }
        throw err;
      }
    }
    throw new OAuthError('unsupported_grant_type', 'grant_type must be authorization_code or refresh_token');
  }

  private async exchangeCode(client: OAuthClient, body: Record<string, unknown>, ipAddress?: string) {
    const code = str(body.code, 200);
    const redirectUri = str(body.redirect_uri);
    const verifier = str(body.code_verifier, 128);
    if (!code || !redirectUri || !verifier) {
      throw new OAuthError('invalid_request', 'code, redirect_uri and code_verifier are required');
    }

    // Read and delete in one statement, so two exchanges of the same code can't both succeed.
    const deleted = await this.codes
      .createQueryBuilder()
      .delete()
      .from(OAuthCode)
      .where('"codeHash" = :codeHash', { codeHash: hashToken(code) })
      .returning('*')
      .execute();
    const saved = (deleted.raw as OAuthCode[])[0];

    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const valid =
      saved &&
      saved.clientId === client.id &&
      new Date(saved.expiresAt).getTime() > Date.now() &&
      saved.redirectUri === redirectUri &&
      CODE_VERIFIER.test(verifier) &&
      sameSecret(challenge, saved.codeChallenge);
    if (!valid) {
      throw new OAuthError('invalid_grant', 'The code is invalid, expired, already used, or does not match');
    }

    const user = await this.usersService.findById(saved.userId);
    if (!user || !user.isActive) {
      throw new OAuthError('invalid_grant', 'The user is no longer active');
    }
    const tokens = await this.authService.issueTokens(user, OAUTH_SESSION_LABEL(client.name), ipAddress);
    return this.tokenResponse(tokens, saved.scope);
  }

  private tokenResponse(tokens: { accessToken: string; refreshToken: string }, scope?: string | null) {
    return {
      access_token: tokens.accessToken,
      token_type: 'Bearer',
      expires_in: Number(this.config.get('JWT_ACCESS_TTL')),
      refresh_token: tokens.refreshToken,
      ...(scope && { scope }),
    };
  }

  // ---- /oauth/revoke ----

  /** Ends the session behind a refresh token. Unknown tokens are ignored (RFC 7009). */
  async revoke(body: Record<string, unknown>, authorization: string | undefined) {
    this.authenticateClient(body, authorization);
    const token = str(body.token);
    if (token) await this.authService.logout(token);
  }

  // ---- client authentication ----

  /** Accepts client_id/client_secret in the form body or as HTTP Basic auth. */
  private authenticateClient(body: Record<string, unknown>, authorization: string | undefined): OAuthClient {
    const client = this.client;
    let id = str(body.client_id);
    let secret = str(body.client_secret);
    if (authorization?.startsWith('Basic ')) {
      const decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
      const colon = decoded.indexOf(':');
      if (colon > 0) {
        try {
          id = decodeURIComponent(decoded.slice(0, colon));
          secret = decodeURIComponent(decoded.slice(colon + 1));
        } catch {
          id = secret = undefined;
        }
      }
    }
    if (!client || !id || !secret || id !== client.id || !sameSecret(secret, client.secret)) {
      throw new OAuthError('invalid_client', 'Client authentication failed', HttpStatus.UNAUTHORIZED);
    }
    return client;
  }
}
