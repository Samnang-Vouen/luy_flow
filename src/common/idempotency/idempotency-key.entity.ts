import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum IdempotencyKeyStatus {
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
}

/** One Idempotency-Key a user sent, and the response to replay if the same request arrives again. */
@Entity('idempotency_keys')
@Index('UQ_idempotency_keys_userId_key', ['userId', 'key'], { unique: true })
export class IdempotencyKey {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 255 })
  key: string;

  /** SHA-256 of method, path and body: the same key must always come with the same request. */
  @Column({ type: 'char', length: 64 })
  requestHash: string;

  @Column({
    type: 'enum',
    enum: IdempotencyKeyStatus,
    enumName: 'idempotency_keys_status_enum',
    default: IdempotencyKeyStatus.IN_PROGRESS,
  })
  status: IdempotencyKeyStatus;

  @Column({ type: 'int', nullable: true })
  responseStatus: number | null;

  @Column({ type: 'jsonb', nullable: true })
  responseBody: object | null;

  @CreateDateColumn()
  createdAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;
}
