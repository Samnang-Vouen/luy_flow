import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';

// Enabled by the Docker tests service, which supplies the isolated local database.
// Do not enable this suite against a shared/production database.
const databaseDescribe =
  process.env.RUN_DATABASE_TESTS === '1' ? describe : describe.skip;
databaseDescribe('Financial analytics with PostgreSQL and the full app', () => {
  let app: INestApplication;
  const users: string[] = [];
  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  }, 60000);
  afterAll(async () => {
    if (!app) return;
    try {
      const repository = app.get(DataSource).getRepository(User);
      for (const id of users) await repository.delete({ id });
    } finally {
      await app.close();
    }
  });

  it('integrates auth, accounts, transactions, budgets, reports, recommendations and ownership', async () => {
    const http = app.getHttpServer();
    const login = async () => {
      const email = `analytics-${randomUUID()}@example.test`;
      const password = 'LuyFlow-local-test-2026!';
      const registered = await request(http)
        .post('/auth/register')
        .send({ name: 'Analytics Test', email, password })
        .expect(201);
      users.push(registered.body.id);
      const response = await request(http)
        .post('/auth/login')
        .send({ email, password })
        .expect(200);
      expect(typeof response.body.accessToken).toBe('string');
      return response.body.accessToken as string;
    };
    const token = await login();
    const otherToken = await login();
    const post = (url: string, body: object) =>
      request(http)
        .post(url)
        .auth(token, { type: 'bearer' })
        .send(body)
        .expect(201);
    const get = (url: string) =>
      request(http).get(url).auth(token, { type: 'bearer' }).expect(200);
    const account = (
      await post('/accounts', {
        name: 'Analytics USD',
        type: 'cash',
        currency: 'USD',
        openingBalance: 0,
      })
    ).body;
    const khr = (
      await post('/accounts', {
        name: 'Analytics KHR',
        type: 'cash',
        currency: 'KHR',
        openingBalance: 0,
      })
    ).body;
    const category = (
      await post('/categories', {
        name: `Analytics Food ${randomUUID()}`,
        type: 'expense',
      })
    ).body;
    await post('/transactions', {
      accountId: account.id,
      type: 'income',
      amount: 1000,
      date: '2026-11-01',
    });
    const expense = (
      await post('/transactions', {
        accountId: account.id,
        categoryId: category.id,
        type: 'expense',
        amount: 85.25,
        date: '2026-11-02',
      })
    ).body;
    await post('/transactions', {
      accountId: account.id,
      type: 'expense',
      categoryId: category.id,
      amount: 40,
      date: '2026-10-31',
    });
    await post('/transactions', {
      accountId: khr.id,
      type: 'income',
      amount: 4000,
      date: '2026-11-01',
    });
    await post('/transactions', {
      accountId: khr.id,
      type: 'expense',
      amount: 2000,
      date: '2026-11-02',
    });
    const budget = (
      await post('/budgets', {
        month: '2026-11',
        currency: 'USD',
        amount: 100,
        categoryId: category.id,
      })
    ).body;
    await request(http)
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send({
        month: '2026-11',
        currency: 'USD',
        amount: 100,
        categoryId: category.id,
      })
      .expect(409);
    // The two partial unique indexes allow an overall budget alongside a category budget.
    const overall = (
      await post('/budgets', { month: '2026-11', currency: 'USD', amount: 200 })
    ).body;
    await request(http)
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send({ month: '2026-11', currency: 'USD', amount: 300 })
      .expect(409);
    expect((await get(`/budgets/${budget.id}/progress`)).body).toMatchObject({
      spent: '85.25',
      remaining: '14.75',
      status: 'warning',
    });
    const filters = 'dateFrom=2026-11-01&dateTo=2026-11-30';
    const summary = (await get(`/reports/summary?${filters}`)).body.data;
    expect(summary).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          currency: 'USD',
          income: '1000.00',
          expenses: '85.25',
          surplus: '914.75',
        }),
        expect.objectContaining({
          currency: 'KHR',
          income: '4000.00',
          expenses: '2000.00',
          surplus: '2000.00',
        }),
      ]),
    );
    expect(
      (await get(`/reports/categories?${filters}&currency=USD`)).body.data,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ categoryId: category.id, amount: '85.25' }),
      ]),
    );
    for (const groupBy of ['day', 'week', 'month', 'year']) {
      expect(
        (await get(`/reports/trends?${filters}&groupBy=${groupBy}`)).body.data
          .length,
      ).toBeGreaterThan(0);
    }
    expect(
      (await get('/recommendations?month=2026-11')).body.recommendations,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'BUDGET_NEAR_LIMIT',
          budgetId: budget.id,
        }),
        expect.objectContaining({
          code: 'SAVINGS_OPPORTUNITY',
          currency: 'USD',
          amount: '200.00',
        }),
        expect.objectContaining({
          code: 'UNUSUAL_CATEGORY_SPENDING',
          currency: 'USD',
          categoryId: category.id,
          amount: '85.25',
          baselineAmount: '40.00',
          baselineMonth: '2026-10',
          increasePercentage: '113.13',
        }),
      ]),
    );
    await request(http)
      .get(`/budgets/${budget.id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    expect(
      (
        await request(http)
          .get(`/reports/summary?${filters}`)
          .auth(otherToken, { type: 'bearer' })
          .expect(200)
      ).body.data,
    ).toEqual([]);
    await request(http)
      .patch(`/transactions/${expense.id}`)
      .auth(token, { type: 'bearer' })
      .send({ amount: 110 })
      .expect(200);
    expect((await get(`/budgets/${budget.id}/progress`)).body).toMatchObject({
      spent: '110.00',
      remaining: '-10.00',
      status: 'exceeded',
    });
    await request(http)
      .patch(`/budgets/${budget.id}`)
      .auth(token, { type: 'bearer' })
      .send({ amount: 150 })
      .expect(200);
    expect((await get(`/budgets/${budget.id}/progress`)).body.status).toBe(
      'on_track',
    );
    for (const id of [budget.id, overall.id])
      await request(http)
        .delete(`/budgets/${id}`)
        .auth(token, { type: 'bearer' })
        .expect(204);
    await request(http)
      .get(`/budgets/${budget.id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
  }, 60000);
});
