import {
  BadRequestException,
  CallHandler,
  ConflictException,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import type { Request, Response } from 'express';
import { Observable, catchError, from, mergeMap, of, throwError } from 'rxjs';
import { Repository } from 'typeorm';
import { IdempotencyKey, IdempotencyKeyStatus } from './idempotency-key.entity';

export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
const KEY_PATTERN = /^[\x21-\x7E]{1,255}$/; // visible ASCII, e.g. a UUID
const KEY_TTL = `interval '24 hours'`;

type Claim = { id: string } | { existing: IdempotencyKey };

/**
 * Makes a POST safe to retry. When the request carries an Idempotency-Key header,
 * the first response is stored and replayed for any repeat of the same request
 * by the same user, so a double tap or a retry after a timeout only counts once.
 * Requests without the header are not affected. Must run after the auth guard.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    @InjectRepository(IdempotencyKey)
    private readonly keys: Repository<IdempotencyKey>,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const req = http.getRequest<Request & { user?: { userId?: string } }>();
    const res = http.getResponse<Response>();

    const header = req.headers[IDEMPOTENCY_HEADER.toLowerCase()];
    if (header === undefined) return next.handle();
    if (typeof header !== 'string' || !KEY_PATTERN.test(header)) {
      throw new BadRequestException(
        `${IDEMPOTENCY_HEADER} must be 1-255 visible ASCII characters`,
      );
    }
    const userId = req.user?.userId;
    if (!userId) return next.handle();

    const requestHash = hashRequest(req);
    const claim = await this.claim(userId, header, requestHash);

    if ('existing' in claim) {
      const { existing } = claim;
      if (existing.requestHash !== requestHash) {
        throw new UnprocessableEntityException(
          `This ${IDEMPOTENCY_HEADER} was already used for a different request`,
        );
      }
      if (existing.status !== IdempotencyKeyStatus.COMPLETED) {
        throw new ConflictException(
          `A request with this ${IDEMPOTENCY_HEADER} is still being processed`,
        );
      }
      res.status(existing.responseStatus ?? res.statusCode);
      res.setHeader('Idempotent-Replayed', 'true');
      return of(existing.responseBody);
    }

    return next.handle().pipe(
      // Failed: release the key so the client can retry with it.
      catchError((err: unknown) =>
        from(this.keys.delete({ id: claim.id })).pipe(
          mergeMap(() => throwError(() => err)),
        ),
      ),
      mergeMap(async (body: unknown) => {
        try {
          await this.keys.update(
            { id: claim.id },
            {
              status: IdempotencyKeyStatus.COMPLETED,
              responseStatus: res.statusCode,
              responseBody: toJson(body),
              completedAt: new Date(),
            },
          );
        } catch (err) {
          // The action itself succeeded, so still answer with it. The key stays
          // in progress (repeats get 409) until it expires, never a duplicate.
          this.logger.error(`Could not store idempotent response ${claim.id}`, err as Error);
        }
        return body;
      }),
    );
  }

  /** Reserves the key for this request, or returns the row another request already holds. */
  private async claim(userId: string, key: string, requestHash: string): Promise<Claim> {
    await this.keys
      .createQueryBuilder()
      .delete()
      .where(`"userId" = :userId AND "key" = :key AND "createdAt" < now() - ${KEY_TTL}`, {
        userId,
        key,
      })
      .execute();

    // Two attempts: the holder may release the key (failed request) between insert and read.
    for (let attempt = 0; attempt < 2; attempt++) {
      const inserted = await this.keys
        .createQueryBuilder()
        .insert()
        .into(IdempotencyKey)
        .values({ userId, key, requestHash, status: IdempotencyKeyStatus.IN_PROGRESS })
        .orIgnore()
        .returning(['id'])
        .execute();
      const id = (inserted.raw as { id: string }[])[0]?.id;
      if (id) return { id };

      const existing = await this.keys.findOne({ where: { userId, key } });
      if (existing) return { existing };
    }
    throw new ConflictException(
      `A request with this ${IDEMPOTENCY_HEADER} is still being processed`,
    );
  }
}

function hashRequest(req: Request): string {
  const path = req.originalUrl.split('?')[0];
  return createHash('sha256')
    .update(`${req.method} ${path}\n${stableStringify(req.body ?? null)}`)
    .digest('hex');
}

/** JSON with object keys sorted, so the same body always hashes the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.keys(value as object)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/**
 * The body exactly as it was sent the first time (dates as strings, entities as plain objects).
 * Handlers using this interceptor return an object, an array or nothing.
 */
function toJson(body: unknown): object | null {
  return body === undefined || body === null
    ? null
    : (JSON.parse(JSON.stringify(body)) as object);
}
