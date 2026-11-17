import { jest } from '@jest/globals';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { firstValueFrom, of, throwError } from 'rxjs';
import { IdempotencyKeyStatus } from './idempotency-key.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';

describe('IdempotencyInterceptor', () => {
  const execute = jest.fn<() => Promise<unknown>>();
  const qb: Record<string, unknown> = { execute };
  for (const m of ['delete', 'insert', 'into', 'values', 'orIgnore', 'returning', 'where']) {
    qb[m] = () => qb;
  }
  const keys = {
    createQueryBuilder: () => qb,
    findOne: jest.fn<() => Promise<unknown>>(),
    update: jest.fn<() => Promise<unknown>>(),
    delete: jest.fn<() => Promise<unknown>>(),
  };
  const interceptor = new IdempotencyInterceptor(keys as never);

  const res = {
    statusCode: 201,
    status: jest.fn(function (this: { statusCode: number }, code: number) {
      this.statusCode = code;
      return this;
    }),
    setHeader: jest.fn(),
  };
  const request = (key?: string, body: unknown = { amount: 20 }) => ({
    method: 'POST',
    originalUrl: '/savings-goals/g1/contributions',
    headers: key === undefined ? {} : { 'idempotency-key': key },
    body,
    user: { userId: 'u1' },
  });
  const context = (req: unknown) =>
    ({ switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }) }) as never;
  const handler = (body: unknown) => ({ handle: jest.fn(() => of(body)) });

  /** The hash a first request stored, captured by running one through the interceptor. */
  async function hashOf(body: unknown) {
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [{ id: 'tmp' }] });
    const values = jest.spyOn(qb as { values: (v: unknown) => unknown }, 'values');
    await firstValueFrom(
      await interceptor.intercept(context(request('k', body)), handler({})),
    );
    const hash = (values.mock.calls[0][0] as { requestHash: string }).requestHash;
    values.mockRestore();
    jest.clearAllMocks();
    return hash;
  }

  beforeEach(() => {
    jest.clearAllMocks();
    res.statusCode = 201;
  });

  it('passes through when no key is sent', async () => {
    const next = handler({ ok: true });
    const out = await firstValueFrom(await interceptor.intercept(context(request()), next));
    expect(out).toEqual({ ok: true });
    expect(execute).not.toHaveBeenCalled();
  });

  it('rejects a malformed key with 400', async () => {
    await expect(
      interceptor.intercept(context(request('has space')), handler({})),
    ).rejects.toThrow(BadRequestException);
  });

  it('runs the handler once and stores the response for a new key', async () => {
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [{ id: 'k1' }] });
    const next = handler({ id: 'c1', createdAt: new Date('2026-11-17T00:00:00Z') });
    const out = await firstValueFrom(await interceptor.intercept(context(request('abc')), next));

    expect(next.handle).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ id: 'c1' });
    expect(keys.update).toHaveBeenCalledWith(
      { id: 'k1' },
      expect.objectContaining({
        status: IdempotencyKeyStatus.COMPLETED,
        responseStatus: 201,
        responseBody: { id: 'c1', createdAt: '2026-11-17T00:00:00.000Z' },
      }),
    );
  });

  it('replays the stored response without running the handler again', async () => {
    const requestHash = await hashOf({ amount: 20 });
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [] });
    keys.findOne.mockResolvedValue({
      id: 'k1',
      requestHash,
      status: IdempotencyKeyStatus.COMPLETED,
      responseStatus: 201,
      responseBody: { id: 'c1' },
    });
    const next = handler({ id: 'c2' });
    const out = await firstValueFrom(
      await interceptor.intercept(context(request('k', { amount: 20 })), next),
    );

    expect(out).toEqual({ id: 'c1' });
    expect(next.handle).not.toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith('Idempotent-Replayed', 'true');
  });

  it('treats the same body with keys in another order as the same request', async () => {
    expect(await hashOf({ a: 1, b: { c: 2, d: 3 } })).toBe(
      await hashOf({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('rejects the same key with a different body with 422', async () => {
    const requestHash = await hashOf({ amount: 20 });
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [] });
    keys.findOne.mockResolvedValue({
      requestHash,
      status: IdempotencyKeyStatus.COMPLETED,
    });
    await expect(
      interceptor.intercept(context(request('k', { amount: 50 })), handler({})),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('rejects a repeat while the first request is still running with 409', async () => {
    const requestHash = await hashOf({ amount: 20 });
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [] });
    keys.findOne.mockResolvedValue({ requestHash, status: IdempotencyKeyStatus.IN_PROGRESS });
    await expect(
      interceptor.intercept(context(request('k', { amount: 20 })), handler({})),
    ).rejects.toThrow(ConflictException);
  });

  it('releases the key when the handler fails, so a retry runs again', async () => {
    execute.mockResolvedValueOnce({}).mockResolvedValueOnce({ raw: [{ id: 'k1' }] });
    keys.delete.mockResolvedValue({});
    const next = { handle: () => throwError(() => new NotFoundException()) };
    await expect(
      firstValueFrom(await interceptor.intercept(context(request('abc')), next)),
    ).rejects.toThrow(NotFoundException);
    expect(keys.delete).toHaveBeenCalledWith({ id: 'k1' });
    expect(keys.update).not.toHaveBeenCalled();
  });
});
