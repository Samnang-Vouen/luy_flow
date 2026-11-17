import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { IdempotencyKey } from './idempotency-key.entity';
import { IdempotencyInterceptor } from './idempotency.interceptor';

/** Import this module, then add @UseInterceptors(IdempotencyInterceptor) to a POST handler. */
@Module({
  imports: [TypeOrmModule.forFeature([IdempotencyKey])],
  providers: [IdempotencyInterceptor],
  exports: [TypeOrmModule, IdempotencyInterceptor],
})
export class IdempotencyModule {}
