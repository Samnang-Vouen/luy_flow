import { jest } from '@jest/globals';
import { UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { hashToken } from '../auth/utils/hash.util';
import { OAuthError, OAuthService } from './oauth.service';

const CLIENT_ID = 'tripsplit';
const SECRET = 'test-secret-0123456789';
const REDIRECT = 'https://tripsplit.example/api/v1/integrations/luyflow/callback';
const VERIFIER = 'v'.repeat(43) + '-._~abc';
const CHALLENGE = createHash('sha256').update(VERIFIER).digest('base64url');

describe('OAuthService', () => {
  let env: Record<string, string | undefined>;
  const config = { get: (key: string) => env[key] };

  const deleteExecute = jest.fn<() => Promise<{ raw: unknown[] }>>();
  const qb = {
    delete: () => qb,
    from: () => qb,
    where: () => qb,
    returning: () => qb,
    execute: deleteExecute,
  };
  const codes = {
    createQueryBuilder: () => qb,
    insert: jest.fn<(row: unknown) => Promise<unknown>>(),
    delete: jest.fn<() => Promise<unknown>>(),
  };
  const authService = {
    issueTokens: jest.fn<(...a: unknown[]) => Promise<{ accessToken: string; refreshToken: string }>>(),
    refresh: jest.fn<(...a: unknown[]) => Promise<{ accessToken: string; refreshToken: string }>>(),
    logout: jest.fn<(t: string) => Promise<void>>(),
  };
  const usersService = { findById: jest.fn<(id: string) => Promise<unknown>>() };
  const service = new OAuthService(
    codes as never,
    authService as never,
    usersService as never,
    config as never,
  );

  const authorizeQuery = (over: Record<string, unknown> = {}) => ({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    code_challenge: CHALLENGE,
    code_challenge_method: 'S256',
    state: 'xyz',
    scope: 'savings:read savings:write',
    ...over,
  });
  const clientAuth = { client_id: CLIENT_ID, client_secret: SECRET };
  const savedCode = (over: Record<string, unknown> = {}) => ({
    clientId: CLIENT_ID,
    userId: 'u1',
    redirectUri: REDIRECT,
    codeChallenge: CHALLENGE,
    scope: 'savings:read savings:write',
    expiresAt: new Date(Date.now() + 60_000),
    ...over,
  });
  const expectOAuthError = async (p: Promise<unknown>, error: string, status = 400) => {
    const err = await p.catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OAuthError);
    expect((err as OAuthError).getStatus()).toBe(status);
    expect((err as OAuthError).getResponse()).toMatchObject({ error });
  };

  beforeEach(() => {
    jest.clearAllMocks();
    env = {
      OAUTH_CLIENT_ID: CLIENT_ID,
      OAUTH_CLIENT_SECRET: SECRET,
      OAUTH_REDIRECT_URI: REDIRECT,
      JWT_ACCESS_TTL: '900',
    };
    authService.issueTokens.mockResolvedValue({ accessToken: 'jwt', refreshToken: 'rt' });
    usersService.findById.mockResolvedValue({ id: 'u1', email: 'a@b.c', role: 'user', isActive: true });
  });

  describe('checkAuthorizeRequest', () => {
    it('accepts a valid request', () => {
      const check = service.checkAuthorizeRequest(authorizeQuery());
      expect(check).toMatchObject({ kind: 'ok', params: { state: 'xyz', code_challenge: CHALLENGE } });
    });

    it('shows an error page, never a redirect, when OAuth is not configured', () => {
      env.OAUTH_CLIENT_SECRET = undefined;
      expect(service.checkAuthorizeRequest(authorizeQuery()).kind).toBe('invalid');
    });

    it.each([
      { client_id: 'evil' },
      { redirect_uri: 'https://evil.example/callback' },
      { redirect_uri: `${REDIRECT}/extra` },
      { redirect_uri: [REDIRECT, REDIRECT] },
    ])('never redirects to an unregistered client or URI: %j', (over) => {
      expect(service.checkAuthorizeRequest(authorizeQuery(over)).kind).toBe('invalid');
    });

    it.each([
      [{ code_challenge_method: 'plain' }, 'invalid_request'],
      [{ code_challenge: undefined }, 'invalid_request'],
      [{ code_challenge: 'too-short' }, 'invalid_request'],
      [{ response_type: 'token' }, 'unsupported_response_type'],
    ])('sends %j back to the client as %s, keeping state', (over, error) => {
      const check = service.checkAuthorizeRequest(authorizeQuery(over));
      expect(check.kind).toBe('redirect');
      const url = new URL((check as { url: string }).url);
      expect(url.origin + url.pathname).toBe(REDIRECT);
      expect(url.searchParams.get('error')).toBe(error);
      expect(url.searchParams.get('state')).toBe('xyz');
    });
  });

  describe('approve and deny', () => {
    it('stores only the hash of a new code and redirects with code and state', async () => {
      const check = service.checkAuthorizeRequest(authorizeQuery());
      if (check.kind !== 'ok') throw new Error('expected ok');
      const url = new URL(await service.approve('u1', check.params));
      const code = url.searchParams.get('code')!;
      expect(code.length).toBeGreaterThanOrEqual(43);
      expect(url.searchParams.get('state')).toBe('xyz');
      expect(codes.insert).toHaveBeenCalledWith(
        expect.objectContaining({ codeHash: hashToken(code), userId: 'u1', codeChallenge: CHALLENGE }),
      );
      expect(JSON.stringify(codes.insert.mock.calls[0][0])).not.toContain(code);
    });

    it('sends access_denied with the state when the user taps Deny', () => {
      const check = service.checkAuthorizeRequest(authorizeQuery());
      if (check.kind !== 'ok') throw new Error('expected ok');
      const url = new URL(service.deny(check.params));
      expect(url.searchParams.get('error')).toBe('access_denied');
      expect(url.searchParams.get('state')).toBe('xyz');
      expect(url.searchParams.get('code')).toBeNull();
    });
  });

  describe('token: client authentication', () => {
    it.each([
      [{}],
      [{ client_id: CLIENT_ID }],
      [{ client_id: CLIENT_ID, client_secret: 'wrong' }],
      [{ client_id: 'other', client_secret: SECRET }],
    ])('rejects %j with 401 invalid_client', async (auth) => {
      await expectOAuthError(
        service.token({ ...auth, grant_type: 'refresh_token', refresh_token: 'rt' }, undefined),
        'invalid_client',
        401,
      );
      expect(authService.refresh).not.toHaveBeenCalled();
    });

    it('accepts HTTP Basic client authentication', async () => {
      authService.refresh.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
      const basic = 'Basic ' + Buffer.from(`${CLIENT_ID}:${SECRET}`).toString('base64');
      await expect(
        service.token({ grant_type: 'refresh_token', refresh_token: 'rt' }, basic),
      ).resolves.toMatchObject({ access_token: 'a2' });
    });
  });

  describe('token: authorization_code', () => {
    const exchange = (over: Record<string, unknown> = {}) =>
      service.token(
        { ...clientAuth, grant_type: 'authorization_code', code: 'the-code', redirect_uri: REDIRECT, code_verifier: VERIFIER, ...over },
        undefined,
        '10.0.0.1',
      );

    it('issues tokens for a valid code and verifier', async () => {
      deleteExecute.mockResolvedValue({ raw: [savedCode()] });
      await expect(exchange()).resolves.toEqual({
        access_token: 'jwt',
        token_type: 'Bearer',
        expires_in: 900,
        refresh_token: 'rt',
        scope: 'savings:read savings:write',
      });
      expect(authService.issueTokens).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'u1' }),
        'TripSplit (OAuth)',
        '10.0.0.1',
      );
    });

    it.each([
      ['an unknown or already used code', null],
      ['an expired code', savedCode({ expiresAt: new Date(Date.now() - 1000) })],
      ['a code issued to another client', savedCode({ clientId: 'other' })],
      ['a different redirect_uri', savedCode({ redirectUri: 'https://tripsplit.example/other' })],
      ['a code_verifier that does not match', savedCode({ codeChallenge: 'x'.repeat(43) })],
    ])('rejects %s with invalid_grant', async (_label, row) => {
      deleteExecute.mockResolvedValue({ raw: row ? [row] : [] });
      await expectOAuthError(exchange(), 'invalid_grant');
      expect(authService.issueTokens).not.toHaveBeenCalled();
    });

    it('rejects a deactivated user', async () => {
      deleteExecute.mockResolvedValue({ raw: [savedCode()] });
      usersService.findById.mockResolvedValue({ id: 'u1', isActive: false });
      await expectOAuthError(exchange(), 'invalid_grant');
    });

    it('requires code, redirect_uri and code_verifier', async () => {
      await expectOAuthError(exchange({ code_verifier: undefined }), 'invalid_request');
      expect(deleteExecute).not.toHaveBeenCalled();
    });
  });

  describe('token: refresh_token and others', () => {
    it('rotates through the normal session refresh', async () => {
      authService.refresh.mockResolvedValue({ accessToken: 'a2', refreshToken: 'r2' });
      const res = await service.token({ ...clientAuth, grant_type: 'refresh_token', refresh_token: 'rt' }, undefined, '10.0.0.1');
      expect(res).toEqual({ access_token: 'a2', token_type: 'Bearer', expires_in: 900, refresh_token: 'r2' });
      expect(authService.refresh).toHaveBeenCalledWith('rt', 'TripSplit (OAuth)', '10.0.0.1');
    });

    it('turns an invalid refresh token into invalid_grant', async () => {
      authService.refresh.mockRejectedValue(new UnauthorizedException());
      await expectOAuthError(
        service.token({ ...clientAuth, grant_type: 'refresh_token', refresh_token: 'old' }, undefined),
        'invalid_grant',
      );
    });

    it('rejects other grant types', async () => {
      await expectOAuthError(service.token({ ...clientAuth, grant_type: 'password' }, undefined), 'unsupported_grant_type');
    });
  });

  describe('revoke', () => {
    it('ends the session for the token', async () => {
      await service.revoke({ ...clientAuth, token: 'rt' }, undefined);
      expect(authService.logout).toHaveBeenCalledWith('rt');
    });

    it('requires client authentication', async () => {
      await expectOAuthError(service.revoke({ token: 'rt' }, undefined), 'invalid_client', 401);
      expect(authService.logout).not.toHaveBeenCalled();
    });
  });
});
