import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AuditLogsService } from '../src/audit-logs/audit-logs.service';
import { JwtStrategy } from '../src/auth/strategies/jwt.strategy';
import { BudgetsController } from '../src/budgets/budgets.controller';
import { BudgetsService } from '../src/budgets/budgets.service';
import { Budget } from '../src/budgets/entities/budget.entity';
import { CategoriesService } from '../src/categories/categories.service';
import { RecommendationsController } from '../src/recommendations/recommendations.controller';
import { RecommendationsService } from '../src/recommendations/recommendations.service';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { Transaction } from '../src/transactions/entities/transaction.entity';
import { UsersService } from '../src/users/users.service';

// Real HTTP controllers, validation, JWT strategy and services; repository doubles
// keep this suite independent of PostgreSQL/Redis. This does not verify live SQL.
describe('Financial analytics HTTP integration', () => {
  let app: INestApplication;
  const userId = '11111111-1111-4111-8111-111111111111';
  const id = '22222222-2222-4222-8222-222222222222';
  const secret = 'analytics-test-secret-only';
  let rows: Budget[];
  let token: string;
  let otherToken: string;

  beforeAll(async () => {
    const repo = {
      create: (data: Partial<Budget>) => ({ ...data, id }),
      save: async (data: Budget) => {
        const index = rows.findIndex((row) => row.id === data.id);
        if (index < 0) rows.push({ ...data });
        else rows[index] = { ...data };
        return { ...data };
      },
      findOne: async ({ where }: { where: Partial<Budget> }) =>
        rows.find(
          (row) => row.id === where.id && row.userId === where.userId,
        ) ?? null,
      find: async ({ where }: { where: Partial<Budget> }) =>
        rows.filter(
          (row) =>
            row.userId === where.userId &&
            (!where.month || row.month === where.month),
        ),
      remove: async (data: Budget) => {
        rows = rows.filter((row) => row.id !== data.id);
      },
    };
    const qb: Record<string, jest.Mock> = {};
    for (const method of [
      'where',
      'andWhere',
      'select',
      'addSelect',
      'groupBy',
      'addGroupBy',
      'orderBy',
      'addOrderBy',
      'leftJoin',
    ])
      qb[method] = jest.fn().mockReturnValue(qb);
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    qb.getRawOne = jest.fn().mockResolvedValue({ spent: '25.10' });
    const moduleRef = await Test.createTestingModule({
      imports: [PassportModule],
      controllers: [
        BudgetsController,
        ReportsController,
        RecommendationsController,
      ],
      providers: [
        BudgetsService,
        ReportsService,
        RecommendationsService,
        JwtStrategy,
        { provide: ConfigService, useValue: { get: () => secret } },
        { provide: getRepositoryToken(Budget), useValue: repo },
        {
          provide: getRepositoryToken(Transaction),
          useValue: { createQueryBuilder: () => qb },
        },
        { provide: CategoriesService, useValue: { findOwned: jest.fn() } },
        { provide: AuditLogsService, useValue: { record: jest.fn() } },
        {
          provide: UsersService,
          useValue: {
            // The JWT strategy re-reads the user so deactivation applies.
            findById: jest.fn(async (id: string) => ({
              id,
              email: 'owner@example.test',
              role: 'user',
              isActive: true,
            })),
          },
        },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
    const jwt = new JwtService();
    token = jwt.sign(
      { sub: userId, email: 'owner@example.test', role: 'user' },
      { secret, expiresIn: 60 },
    );
    otherToken = jwt.sign(
      { sub: '33333333-3333-4333-8333-333333333333', role: 'user' },
      { secret, expiresIn: 60 },
    );
  });
  beforeEach(() => {
    rows = [];
  });
  afterAll(async () => {
    await app?.close();
  });

  const payload = { month: '2026-11', currency: 'usd', amount: 100 };

  it.each([
    '/budgets',
    '/reports/summary',
    '/reports/categories',
    '/reports/trends',
    '/recommendations?month=2026-11',
  ])('requires a real JWT for %s', async (path) => {
    await request(app.getHttpServer()).get(path).expect(401);
  });

  it('rejects an invalid JWT', async () => {
    await request(app.getHttpServer())
      .get('/budgets')
      .auth('invalid', { type: 'bearer' })
      .expect(401);
  });

  it('runs budget create/list/read/update/progress/delete with ownership and normalization', async () => {
    const created = await request(app.getHttpServer())
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send({ ...payload, userId: 'forged' })
      .expect(201);
    expect(created.body).toMatchObject({
      userId,
      currency: 'USD',
      amount: '100.00',
      categoryId: null,
    });
    const list = await request(app.getHttpServer())
      .get('/budgets?month=2026-11')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(list.body).toHaveLength(1);
    await request(app.getHttpServer())
      .get(`/budgets/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    const updated = await request(app.getHttpServer())
      .patch(`/budgets/${id}`)
      .auth(token, { type: 'bearer' })
      .send({ amount: 50 })
      .expect(200);
    expect(updated.body.amount).toBe('50.00');
    const progress = await request(app.getHttpServer())
      .get(`/budgets/${id}/progress`)
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(progress.body).toMatchObject({
      spent: '25.10',
      remaining: '24.90',
      percentageUsed: '50.20',
    });
    await request(app.getHttpServer())
      .delete(`/budgets/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(204);
    await request(app.getHttpServer())
      .get(`/budgets/${id}`)
      .auth(token, { type: 'bearer' })
      .expect(404);
  });

  it('prevents another user from reading, updating, deleting or analyzing a budget', async () => {
    await request(app.getHttpServer())
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send(payload)
      .expect(201);
    const client = () => request(app.getHttpServer());
    await client()
      .get(`/budgets/${id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await client()
      .get(`/budgets/${id}/progress`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    await client()
      .patch(`/budgets/${id}`)
      .auth(otherToken, { type: 'bearer' })
      .send({ amount: 1 })
      .expect(404);
    await client()
      .delete(`/budgets/${id}`)
      .auth(otherToken, { type: 'bearer' })
      .expect(404);
    expect(
      (
        await client()
          .get('/budgets')
          .auth(otherToken, { type: 'bearer' })
          .expect(200)
      ).body,
    ).toEqual([]);
  });

  it.each([
    { amount: 0 },
    { amount: -1 },
    { amount: 1.001 },
    { amount: '10' },
    { month: '2026-13' },
    { currency: 'INVALID' },
    { categoryId: 'bad-id' },
    { amount: null },
  ])('validates budget input: %j', async (override) => {
    await request(app.getHttpServer())
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send({ ...payload, ...override })
      .expect(400);
  });

  it('rejects null required fields during PATCH', async () => {
    await request(app.getHttpServer())
      .post('/budgets')
      .auth(token, { type: 'bearer' })
      .send(payload)
      .expect(201);
    for (const field of ['amount', 'currency', 'month']) {
      await request(app.getHttpServer())
        .patch(`/budgets/${id}`)
        .auth(token, { type: 'bearer' })
        .send({ [field]: null })
        .expect(400);
    }
  });

  it.each([
    '/reports/summary?dateFrom=2026-02-30',
    '/reports/summary?dateFrom=2026-12-01&dateTo=2026-11-01',
    '/reports/trends?groupBy=invalid',
    '/reports/categories?accountId=invalid',
    '/recommendations',
    '/recommendations?month=2026-00',
    '/budgets/not-a-uuid',
  ])('rejects invalid queries: %s', async (path) => {
    await request(app.getHttpServer())
      .get(path)
      .auth(token, { type: 'bearer' })
      .expect(400);
  });

  it('serves empty reports and recommendations through authenticated routes', async () => {
    for (const path of [
      '/reports/summary',
      '/reports/categories',
      '/reports/trends?groupBy=week',
    ]) {
      expect(
        (
          await request(app.getHttpServer())
            .get(path)
            .auth(token, { type: 'bearer' })
            .expect(200)
        ).body.data,
      ).toEqual([]);
    }
    const result = await request(app.getHttpServer())
      .get('/recommendations?month=2026-11')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(result.body).toMatchObject({
      month: '2026-11',
      hasTransactions: false,
      recommendations: [],
    });
  });
});
