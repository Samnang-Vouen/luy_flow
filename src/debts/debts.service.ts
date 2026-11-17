import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { fromCents, toCents } from '../common/money.util';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { CreateDebtDto } from './dto/create-debt.dto';
import { ListDebtsQueryDto } from './dto/list-debts-query.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';
import { DebtPayment } from './entities/debt-payment.entity';
import { Debt, DebtStatus } from './entities/debt.entity';

@Injectable()
export class DebtsService {
  constructor(
    @InjectRepository(Debt)
    private readonly debtsRepository: Repository<Debt>,
    @InjectRepository(DebtPayment)
    private readonly paymentsRepository: Repository<DebtPayment>,
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async create(userId: string, dto: CreateDebtDto) {
    const principal = dto.principalAmount.toFixed(2);
    const debt = await this.debtsRepository.save(
      this.debtsRepository.create({
        userId,
        counterparty: dto.counterparty,
        direction: dto.direction,
        principalAmount: principal,
        remainingAmount: principal,
        interestRate:
          dto.interestRate === undefined || dto.interestRate === null
            ? null
            : dto.interestRate.toFixed(2),
        dueDate: dto.dueDate ?? null,
        notes: dto.notes ?? null,
      }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'debt.created',
      resourceType: 'debt',
      resourceId: debt.id,
      metadata: { principalAmount: principal, direction: debt.direction },
    });
    return debt;
  }

  findAll(userId: string, query: ListDebtsQueryDto) {
    const where: FindOptionsWhere<Debt> = { userId };
    if (query.status) where.status = query.status;
    if (query.direction) where.direction = query.direction;
    return this.debtsRepository.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  findOne(userId: string, id: string) {
    return this.findOwned(userId, id);
  }

  async update(userId: string, id: string, dto: UpdateDebtDto) {
    const debt = await this.findOwned(userId, id);
    if (dto.counterparty !== undefined) debt.counterparty = dto.counterparty;
    if (dto.direction !== undefined) debt.direction = dto.direction;
    if (dto.interestRate !== undefined) {
      debt.interestRate =
        dto.interestRate === null ? null : dto.interestRate.toFixed(2);
    }
    if (dto.dueDate !== undefined) debt.dueDate = dto.dueDate;
    if (dto.notes !== undefined) debt.notes = dto.notes;
    const updated = await this.debtsRepository.save(debt);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'debt.updated',
      resourceType: 'debt',
      resourceId: id,
    });
    return updated;
  }

  async delete(userId: string, id: string) {
    const debt = await this.findOwned(userId, id);
    await this.debtsRepository.remove(debt);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'debt.deleted',
      resourceType: 'debt',
      resourceId: id,
    });
  }

  async pay(userId: string, id: string, dto: CreateDebtPaymentDto) {
    const { debt, payment, paidOff } = await this.dataSource.transaction(
      async (manager) => {
        const locked = await manager.findOne(Debt, {
          where: { id, userId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!locked) {
          throw new NotFoundException('Debt not found');
        }
        if (locked.status !== DebtStatus.ACTIVE) {
          throw new BadRequestException('Debt is already paid');
        }

        const remaining = toCents(locked.remainingAmount);
        const amount = toCents(dto.amount);
        if (amount > remaining) {
          throw new BadRequestException(
            'Payment is larger than the remaining amount',
          );
        }

        const saved = await manager.save(
          manager.create(DebtPayment, {
            debtId: id,
            userId,
            amount: dto.amount.toFixed(2),
            paidAt: dto.paidAt ?? new Date().toISOString().slice(0, 10),
            note: dto.note ?? null,
            accountId: dto.accountId ?? null,
          }),
        );

        locked.remainingAmount = fromCents(remaining - amount);
        const done = remaining - amount === 0;
        if (done) locked.status = DebtStatus.PAID;
        await manager.save(locked);

        return { debt: locked, payment: saved, paidOff: done };
      },
    );

    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'debt.payment_recorded',
      resourceType: 'debt',
      resourceId: id,
      metadata: { amount: payment.amount },
    });
    if (paidOff) {
      await this.notificationsService.createForUser(userId, {
        title: 'Debt paid off',
        message: `Your debt with ${debt.counterparty} is fully paid.`,
        metadata: { debtId: id },
      });
    }
    return { debt, payment };
  }

  async findPayments(userId: string, id: string) {
    await this.findOwned(userId, id);
    return this.paymentsRepository.find({
      where: { debtId: id },
      order: { createdAt: 'DESC' },
    });
  }

  private async findOwned(userId: string, id: string) {
    const debt = await this.debtsRepository.findOne({ where: { id, userId } });
    if (!debt) {
      throw new NotFoundException('Debt not found');
    }
    return debt;
  }
}
