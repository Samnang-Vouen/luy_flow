import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';

// Covers what the TripSplit integration relies on: currency, externalRef and
// Idempotency-Key on the savings-goal endpoints, against a real PostgreSQL database.
// Needs a local database with migrations applied. Do not run against a shared database.
//   RUN_DATABASE_TESTS=1 npm run test:e2e -- savings-goals
const databaseDescribe =
  process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;

databaseDescribe('Savings goals for the TripSplit integration (PostgreSQL)', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;
  let token: string;
  let otherToken: string;
  const users: string[] = [];

  const login = async () => {
    const email = `savings-${randomUUID()}@example.test`;
    const password = 'LuyFlow-local-test-2026!';
    const registered = await request(http)
      .post('/auth/register')
      .send({ name: 'Savings Test', email, password })
      .expect(201);
    users.push(registered.body.id);
    const response = await request(http)
      .post('/auth/login')
      .send({ email, password })
      .expect(200);
    return response.body.accessToken as string;
  };

  const createGoal = (body: object, as = token) =>
    request(http).post('/savings-goals').auth(as, { type: 'bearer' }).send(body);

  const contribute = (goalId: string, body: object, key?: string, as = token) => {
    const req = request(http)
      .post(`/savings-goals/${goalId}/contributions`)
      .auth(as, { type: 'bearer' });
    if (key) req.set('Idempotency-Key', key);
    return req.send(body);
  };

  const savedAmount = async (goalId: string) =>
    (
      await request(http)
        .get(`/savings-goals/${goalId}`)
        .auth(token, { type: 'bearer' })
        .expect(200)
    ).body.currentAmount as string;

  const newGoal = async (over: object = {}) =>
    (await createGoal({ name: 'Kampot trip', targetAmount: 200, ...over }).expect(201))
      .body as { id: string };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    http = app.getHttpServer();
    token = await login();
    otherToken = await login();
  }, 60000);

  afterAll(async () => {
    if (!app) return;
    try {
      // Goals, contributions and idempotency keys are deleted with the user (ON DELETE CASCADE).
      const repository = app.get(DataSource).getRepository(User);
      for (const id of users) await repository.delete({ id });
    } finally {
      await app.close();
    }
  });

  describe('currency', () => {
    it('defaults to USD and stores a given currency uppercased', async () => {
      expect((await newGoal()).id).toBeDefined();
      const plain = await createGoal({ name: 'Plain', targetAmount: 10 }).expect(201);
      expect(plain.body.currency).toBe('USD');
      const khr = await createGoal({
        name: 'Riel trip',
        targetAmount: 800000,
        currency: 'khr',
      }).expect(201);
      expect(khr.body).toMatchObject({ currency: 'KHR', targetAmount: '800000.00' });
    });

    it('rejects an unknown currency with 400', async () => {
      await createGoal({ name: 'Bad', targetAmount: 10, currency: 'ZZZ' }).expect(400);
    });

    it('rejects a contribution in another currency with 422 and saves nothing', async () => {
      const goal = await newGoal({ currency: 'USD' });
      await contribute(goal.id, { amount: 20000, currency: 'KHR' }).expect(422);
      expect(await savedAmount(goal.id)).toBe('0.00');
      await contribute(goal.id, { amount: 20, currency: 'usd' }).expect(201);
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('cannot be changed with PATCH', async () => {
      const goal = await newGoal({ currency: 'USD' });
      const patched = await request(http)
        .patch(`/savings-goals/${goal.id}`)
        .auth(token, { type: 'bearer' })
        .send({ name: 'Renamed', currency: 'KHR' })
        .expect(200);
      expect(patched.body).toMatchObject({ name: 'Renamed', currency: 'USD' });
    });
  });

  describe('externalRef', () => {
    it('stores the ref and returns 409 with the existing goal for a duplicate', async () => {
      const ref = { source: 'tripsplit', id: randomUUID() };
      const first = await createGoal({
        name: 'Kampot trip',
        targetAmount: 200,
        externalRef: ref,
      }).expect(201);
      expect(first.body).toMatchObject({ externalSource: 'tripsplit', externalId: ref.id });

      const duplicate = await createGoal({
        name: 'Kampot again',
        targetAmount: 999,
        externalRef: ref,
      }).expect(409);
      expect(duplicate.body.goal).toMatchObject({ id: first.body.id, name: 'Kampot trip' });
    });

    it('lets another user use the same ref', async () => {
      const ref = { source: 'tripsplit', id: randomUUID() };
      await createGoal({ name: 'Mine', targetAmount: 50, externalRef: ref }).expect(201);
      await createGoal({ name: 'Theirs', targetAmount: 50, externalRef: ref }, otherToken).expect(201);
    });

    it('creates only one goal when the same ref is sent twice at once', async () => {
      const ref = { source: 'tripsplit', id: randomUUID() };
      const body = { name: 'Race', targetAmount: 50, externalRef: ref };
      const results = await Promise.all([createGoal(body), createGoal(body)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    });

    it('rejects a malformed ref with 400', async () => {
      await createGoal({
        name: 'Bad',
        targetAmount: 10,
        externalRef: { source: 'Trip Split', id: '1' },
      }).expect(400);
    });
  });

  describe('Idempotency-Key', () => {
    it('adds the money once and replays the first response for a repeat', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      const first = await contribute(goal.id, { amount: 20 }, key).expect(201);
      expect(first.headers['idempotent-replayed']).toBeUndefined();

      const repeat = await contribute(goal.id, { amount: 20 }, key).expect(201);
      expect(repeat.headers['idempotent-replayed']).toBe('true');
      expect(repeat.body).toEqual(first.body);
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('treats the same body with fields in another order as a repeat', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      await contribute(goal.id, { amount: 20, note: 'From TripSplit' }, key).expect(201);
      const repeat = await contribute(goal.id, { note: 'From TripSplit', amount: 20 }, key).expect(201);
      expect(repeat.headers['idempotent-replayed']).toBe('true');
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('rejects the same key with a different body with 422', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      await contribute(goal.id, { amount: 20 }, key).expect(201);
      await contribute(goal.id, { amount: 50 }, key).expect(422);
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('rejects the same key on another endpoint with 422', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      await contribute(goal.id, { amount: 20 }, key).expect(201);
      const other = await newGoal();
      await contribute(other.id, { amount: 20 }, key).expect(422);
      expect(await savedAmount(other.id)).toBe('0.00');
    });

    it('adds the money once when the same request is sent twice at once', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      const results = await Promise.all([
        contribute(goal.id, { amount: 20 }, key),
        contribute(goal.id, { amount: 20 }, key),
      ]);
      for (const r of results) expect([201, 409]).toContain(r.status);
      expect(results.some((r) => r.status === 201)).toBe(true);
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('releases the key when the request fails, so a corrected retry runs', async () => {
      const goal = await newGoal({ currency: 'USD' });
      const key = randomUUID();
      await contribute(goal.id, { amount: 20, currency: 'KHR' }, key).expect(422);
      const retry = await contribute(goal.id, { amount: 20, currency: 'USD' }, key).expect(201);
      expect(retry.headers['idempotent-replayed']).toBeUndefined();
      expect(await savedAmount(goal.id)).toBe('20.00');
    });

    it('scopes keys per user', async () => {
      const key = randomUUID();
      const mine = await newGoal();
      await contribute(mine.id, { amount: 20 }, key).expect(201);
      const theirs = (
        await createGoal({ name: 'Theirs', targetAmount: 100 }, otherToken).expect(201)
      ).body;
      const res = await contribute(theirs.id, { amount: 5 }, key, otherToken).expect(201);
      expect(res.headers['idempotent-replayed']).toBeUndefined();
    });

    it('treats a key older than 24 hours as new', async () => {
      const goal = await newGoal();
      const key = randomUUID();
      await contribute(goal.id, { amount: 20 }, key).expect(201);
      await app
        .get(DataSource)
        .query(
          `UPDATE "idempotency_keys" SET "createdAt" = now() - interval '25 hours' WHERE "key" = $1`,
          [key],
        );
      const later = await contribute(goal.id, { amount: 30 }, key).expect(201);
      expect(later.headers['idempotent-replayed']).toBeUndefined();
      expect(await savedAmount(goal.id)).toBe('50.00');
    });

    it('also protects goal creation', async () => {
      const key = randomUUID();
      const body = { name: 'Once', targetAmount: 10 };
      const first = await createGoal(body).set('Idempotency-Key', key).expect(201);
      const repeat = await createGoal(body).set('Idempotency-Key', key).expect(201);
      expect(repeat.body.id).toBe(first.body.id);
      expect(repeat.headers['idempotent-replayed']).toBe('true');
    });

    it('works as before without the header', async () => {
      const goal = await newGoal();
      await contribute(goal.id, { amount: 20 }).expect(201);
      await contribute(goal.id, { amount: 20 }).expect(201);
      expect(await savedAmount(goal.id)).toBe('40.00');
    });

    it('rejects a malformed key with 400', async () => {
      const goal = await newGoal();
      await contribute(goal.id, { amount: 20 }, 'has spaces in it').expect(400);
      expect(await savedAmount(goal.id)).toBe('0.00');
    });
  });
});
