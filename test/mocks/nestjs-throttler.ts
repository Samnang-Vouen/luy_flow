import { CanActivate, DynamicModule, Injectable } from '@nestjs/common';

/**
 * Jest-only stand-in for `@nestjs/throttler`.
 *
 * The published package is CommonJS and `require()`s the ESM-only
 * `@nestjs/common`, which Jest's ESM runtime rejects with "require() ES Module
 * in a cycle". The application itself runs fine on Node; only the test runtime
 * needs to skip the real module. E2E suites assert behaviour, not rate limits,
 * so a pass-through guard is enough.
 */
@Injectable()
export class ThrottlerGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

export class ThrottlerModule {
  static forRoot(..._options: unknown[]): DynamicModule {
    return { module: ThrottlerModule };
  }
}

export function Throttle(..._options: unknown[]) {
  return (
    _target: unknown,
    _propertyKey?: unknown,
    _descriptor?: unknown,
  ): void => undefined;
}
