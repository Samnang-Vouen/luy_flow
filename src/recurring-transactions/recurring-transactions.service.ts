import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { RecurringTransaction } from './entities/recurring-transaction.entity';

@Injectable()
export class RecurringTransactionsService {
  constructor(
    @InjectRepository(RecurringTransaction)
    private readonly recurringTransactionsRepository: Repository<RecurringTransaction>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreateRecurringTransactionDto) {
    this.validateDateRange(dto.startDate, dto.endDate);
    const recurringTransaction =
      await this.recurringTransactionsRepository.save(
        this.recurringTransactionsRepository.create({
          ...dto,
          amount: dto.amount.toFixed(2),
          userId,
        }),
      );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'recurring_transaction.created',
      resourceType: 'recurring_transaction',
      resourceId: recurringTransaction.id,
    });
    return recurringTransaction;
  }

  findAllByUser(userId: string) {
    return this.recurringTransactionsRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async update(userId: string, id: string, dto: UpdateRecurringTransactionDto) {
    const recurringTransaction = await this.findOwned(userId, id);
    const startDate = dto.startDate ?? recurringTransaction.startDate;
    const endDate =
      dto.endDate === undefined ? recurringTransaction.endDate : dto.endDate;
    this.validateDateRange(startDate, endDate);
    Object.assign(recurringTransaction, dto);
    if (dto.amount !== undefined) {
      recurringTransaction.amount = dto.amount.toFixed(2);
    }
    const updated =
      await this.recurringTransactionsRepository.save(recurringTransaction);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'recurring_transaction.updated',
      resourceType: 'recurring_transaction',
      resourceId: id,
    });
    return updated;
  }

  async updateStatus(
    userId: string,
    id: string,
    status: RecurringTransaction['status'],
  ) {
    const recurringTransaction = await this.findOwned(userId, id);
    recurringTransaction.status = status;
    const updated =
      await this.recurringTransactionsRepository.save(recurringTransaction);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: `recurring_transaction.${status}`,
      resourceType: 'recurring_transaction',
      resourceId: id,
    });
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    const recurringTransaction = await this.findOwned(userId, id);
    await this.recurringTransactionsRepository.remove(recurringTransaction);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'recurring_transaction.deleted',
      resourceType: 'recurring_transaction',
      resourceId: id,
    });
  }

  private async findOwned(userId: string, id: string) {
    const recurringTransaction =
      await this.recurringTransactionsRepository.findOne({
        where: { id, userId },
      });
    if (!recurringTransaction) {
      throw new NotFoundException('Recurring transaction not found');
    }
    return recurringTransaction;
  }

  private validateDateRange(startDate: string, endDate?: string | null) {
    if (endDate && endDate < startDate) {
      throw new BadRequestException('End date must be on or after start date');
    }
  }
}
