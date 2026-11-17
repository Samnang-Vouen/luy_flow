import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';

// The full "Connect LuyFlow" flow as TripSplit uses it, against a real PostgreSQL database.
// Needs a local database with migrations applied. Do not run against a shared database.
//   RUN_DATABASE_TESTS=1 npm run test:e2e -- oauth
const databaseDescribe =
  process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;

const CLIENT_ID = 'tripsplit';
const SECRET = `e2e-secret-${randomUUID()}`;
const REDIRECT = 'https://tripsplit.example/api/v1/integrations/luyflow/callback';

const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};

databaseDescribe('OAuth for TripSplit (PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  const email = `oauth-${randomUUID()}@example.test`;
  const password = 'LuyFlow-oauth-test-2026!';
  let userId: string;

  const authorizeParams = (challenge: string, state = 'state-123') => ({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    scope: 'savings:read savings:write',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
  });

  /** Submits the consent form, as the browser does. */
  const submitConsent = (fields: Record<string, string>) =>
    request(http).post('/oauth/authorize').type('form').send(fields);

  const getCode = async (challenge: string) => {
    const res = await submitConsent({
      ...authorizeParams(challenge),
      email,
      password,
      decision: 'allow',
    }).expect(302);
    const location = new URL(res.headers.location);
    expect(location.origin + location.pathname).toBe(REDIRECT);
    expect(location.searchParams.get('state')).toBe('state-123');
    return location.searchParams.get('code')!;
  };

  const token = (fields: Record<string, string>) =>
    request(http).post('/oauth/token').type('form').send(fields);

  beforeAll(async () => {
    process.env.OAUTH_CLIENT_ID = CLIENT_ID;
    process.env.OAUTH_CLIENT_SECRET = SECRET;
    process.env.OAUTH_REDIRECT_URI = REDIRECT;
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();
    const registered = await request(http)
      .post('/auth/register')
      .send({ name: 'OAuth Test', email, password })
      .expect(201);
    userId = registered.body.id;
  }, 60000);

  afterAll(async () => {
    if (!app) return;
    try {
      // Sessions and OAuth codes are deleted with the user (ON DELETE CASCADE).
      if (userId) await app.get(DataSource).getRepository(User).delete({ id: userId });
    } finally {
      await app.close();
    }
  });

  it('shows the login and consent page for a valid request', async () => {
    const res = await request(http)
      .get('/oauth/authorize')
      .query(authorizeParams(pkce().challenge))
      .expect(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.text).toContain('Connect TripSplit to LuyFlow');
    expect(res.text).toContain('name="state" value="state-123"');
  });

  it('never redirects to an unregistered redirect_uri', async () => {
    const res = await request(http)
      .get('/oauth/authorize')
      .query({ ...authorizeParams(pkce().challenge), redirect_uri: 'https://evil.example/cb' })
      .expect(400);
    expect(res.headers.location).toBeUndefined();
  });

  it('sends access_denied back when the user taps Deny', async () => {
    const res = await submitConsent({ ...authorizeParams(pkce().challenge), decision: 'deny' }).expect(302);
    const location = new URL(res.headers.location);
    expect(location.searchParams.get('error')).toBe('access_denied');
    expect(location.searchParams.get('state')).toBe('state-123');
    expect(location.searchParams.get('code')).toBeNull();
  });

  it('shows the form again for a wrong password, without a code', async () => {
    const res = await submitConsent({
      ...authorizeParams(pkce().challenge),
      email,
      password: 'wrong-password',
      decision: 'allow',
    }).expect(401);
    expect(res.text).toContain('Wrong email or password.');
    expect(res.headers.location).toBeUndefined();
  });

  it('burns a code after a wrong code_verifier, so it cannot be retried', async () => {
    const { verifier, challenge } = pkce();
    const code = await getCode(challenge);
    const base = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT, client_id: CLIENT_ID, client_secret: SECRET };
    const wrong = await token({ ...base, code_verifier: pkce().verifier }).expect(400);
    expect(wrong.body.error).toBe('invalid_grant');
    const retry = await token({ ...base, code_verifier: verifier }).expect(400);
    expect(retry.body.error).toBe('invalid_grant');
  });

  it('connects, calls the API, refreshes and disconnects', async () => {
    const { verifier, challenge } = pkce();
    const code = await getCode(challenge);
    const exchange = {
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT,
      code_verifier: verifier,
    };

    // A wrong client secret is rejected and does not burn the code.
    const badClient = await token({ ...exchange, client_id: CLIENT_ID, client_secret: 'wrong' }).expect(401);
    expect(badClient.body.error).toBe('invalid_client');

    // Exchange the code (client authenticated with HTTP Basic this time).
    const tokens = await token(exchange)
      .auth(CLIENT_ID, SECRET)
      .expect(200);
    expect(tokens.headers['cache-control']).toBe('no-store');
    expect(tokens.body).toMatchObject({
      token_type: 'Bearer',
      expires_in: expect.any(Number),
      scope: 'savings:read savings:write',
    });
    const { access_token, refresh_token } = tokens.body as { access_token: string; refresh_token: string };

    // The code works only once.
    const reused = await token(exchange).auth(CLIENT_ID, SECRET).expect(400);
    expect(reused.body.error).toBe('invalid_grant');

    // The access token is a normal LuyFlow token: the existing API accepts it.
    const me = await request(http).get('/users/me').auth(access_token, { type: 'bearer' }).expect(200);
    expect(me.body.email).toBe(email);
    const goal = await request(http)
      .post('/savings-goals')
      .auth(access_token, { type: 'bearer' })
      .send({ name: 'Kampot trip', targetAmount: 200, externalRef: { source: 'tripsplit', id: randomUUID() } })
      .expect(201);
    expect(goal.body.currency).toBe('USD');

    // The connection shows up in the user's sessions, labelled with the app name.
    const sessions = await request(http).get('/users/me/sessions').auth(access_token, { type: 'bearer' }).expect(200);
    expect(sessions.body.map((s: { userAgent: string }) => s.userAgent)).toContain('TripSplit (OAuth)');

    // Refresh rotates: the new token works once, the old one stops working.
    const refreshed = await token({ grant_type: 'refresh_token', refresh_token, client_id: CLIENT_ID, client_secret: SECRET }).expect(200);
    const oldAgain = await token({ grant_type: 'refresh_token', refresh_token, client_id: CLIENT_ID, client_secret: SECRET }).expect(400);
    expect(oldAgain.body.error).toBe('invalid_grant');

    // Disconnect: after revoke the refresh token is dead.
    await request(http)
      .post('/oauth/revoke')
      .type('form')
      .send({ token: refreshed.body.refresh_token, client_id: CLIENT_ID, client_secret: SECRET })
      .expect(200);
    const afterRevoke = await token({
      grant_type: 'refresh_token',
      refresh_token: refreshed.body.refresh_token,
      client_id: CLIENT_ID,
      client_secret: SECRET,
    }).expect(400);
    expect(afterRevoke.body.error).toBe('invalid_grant');
  });

  it('rejects revoke without client credentials', async () => {
    const res = await request(http).post('/oauth/revoke').type('form').send({ token: 'anything' }).expect(401);
    expect(res.body.error).toBe('invalid_client');
  });
});
