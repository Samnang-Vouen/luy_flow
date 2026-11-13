import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';

export interface RecordAuditLogInput {
  actorUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditLogsService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogsRepository: Repository<AuditLog>,
  ) {}

  record(input: RecordAuditLogInput) {
    return this.auditLogsRepository.save(
      this.auditLogsRepository.create(input),
    );
  }

  findByActor(actorUserId: string) {
    return this.auditLogsRepository.find({
      where: { actorUserId },
      order: { createdAt: 'DESC' },
      take: 100,
    });
  }
}
