import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AuthService } from '../auth/auth.service';
import { consentPage, invalidRequestPage } from './oauth-pages';
import { AuthorizeCheck, OAuthService } from './oauth.service';

/**
 * OAuth 2.0 authorization code flow with PKCE, for TripSplit.
 * Access tokens are LuyFlow's normal login JWTs, so existing guards accept them;
 * refresh tokens are normal LuyFlow sessions.
 */
@ApiTags('oauth')
@Controller('oauth')
export class OAuthController {
  constructor(
    private readonly oauth: OAuthService,
    private readonly authService: AuthService,
  ) {}

  @Get('authorize')
  @ApiOperation({ summary: 'Login and consent page (opened in the browser)' })
  authorizePage(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const check = this.oauth.checkAuthorizeRequest(query);
    if (check.kind !== 'ok') return this.reject(res, check);
    return this.html(res, HttpStatus.OK, consentPage(this.clientName, check.params));
  }

  @Post('authorize')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Allow or Deny, submitted by the consent page' })
  async authorize(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const check = this.oauth.checkAuthorizeRequest(body);
    if (check.kind !== 'ok') return this.reject(res, check);
    const { params } = check;

    if (body.decision !== 'allow') {
      return res.redirect(HttpStatus.FOUND, this.oauth.deny(params));
    }

    const email = typeof body.email === 'string' ? body.email : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const user = email && password
      ? await this.authService.validateCredentials(email, password)
      : null;
    if (!user) {
      return this.html(
        res,
        HttpStatus.UNAUTHORIZED,
        consentPage(this.clientName, params, 'Wrong email or password.'),
      );
    }

    return res.redirect(HttpStatus.FOUND, await this.oauth.approve(user.id, params));
  }

  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange a code or refresh token for tokens (server to server)' })
  token(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Pragma', 'no-cache');
    return this.oauth.token(body, authorization, req.ip);
  }

  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke a refresh token (disconnect)' })
  async revoke(
    @Body() body: Record<string, unknown>,
    @Headers('authorization') authorization: string | undefined,
  ) {
    await this.oauth.revoke(body, authorization);
    return {};
  }

  private get clientName() {
    return this.oauth.client?.name ?? 'This app';
  }

  private reject(res: Response, check: Exclude<AuthorizeCheck, { kind: 'ok' }>) {
    if (check.kind === 'redirect') return res.redirect(HttpStatus.FOUND, check.url);
    return this.html(res, HttpStatus.BAD_REQUEST, invalidRequestPage(check.message));
  }

  private html(res: Response, status: number, page: string) {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).type('html').send(page);
  }
}
