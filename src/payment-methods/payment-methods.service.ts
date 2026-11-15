import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { PaymentMethod } from './entities/payment-method.entity';

const PG_UNIQUE_VIOLATION = '23505';
const NAME_CONFLICT_MESSAGE = 'A payment method with this name already exists';

@Injectable()
export class PaymentMethodsService {
  constructor(
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodsRepository: Repository<PaymentMethod>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreatePaymentMethodDto) {
    await this.assertNameAvailable(userId, dto.name);
    const paymentMethod = await this.saveOrConflict(
      this.paymentMethodsRepository.create({ ...dto, userId }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'payment_method.created',
      resourceType: 'payment_method',
      resourceId: paymentMethod.id,
    });
    return paymentMethod;
  }

  findAllByUser(userId: string, includeArchived = false) {
    return this.paymentMethodsRepository.find({
      where: includeArchived ? { userId } : { userId, isArchived: false },
      order: { name: 'ASC' },
    });
  }

  /** Returns the payment method if it belongs to the user, otherwise 404.*/
  async findOwned(userId: string, id: string) {
    const paymentMethod = await this.paymentMethodsRepository.findOne({
      where: { id, userId },
    });
    if (!paymentMethod) {
      throw new NotFoundException('Payment method not found');
    }
    return paymentMethod;
  }

  async update(userId: string, id: string, dto: UpdatePaymentMethodDto) {
    const paymentMethod = await this.findOwned(userId, id);
    if (dto.name !== undefined && dto.name !== paymentMethod.name) {
      await this.assertNameAvailable(userId, dto.name, id);
      paymentMethod.name = dto.name;
    }
    const updated = await this.saveOrConflict(paymentMethod);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'payment_method.updated',
      resourceType: 'payment_method',
      resourceId: id,
    });
    return updated;
  }

  async setArchived(userId: string, id: string, isArchived: boolean) {
    const paymentMethod = await this.findOwned(userId, id);
    paymentMethod.isArchived = isArchived;
    const updated = await this.paymentMethodsRepository.save(paymentMethod);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: isArchived
        ? 'payment_method.archived'
        : 'payment_method.unarchived',
      resourceType: 'payment_method',
      resourceId: id,
    });
    return updated;
  }

  private async assertNameAvailable(
    userId: string,
    name: string,
    excludeId?: string,
  ) {
    const qb = this.paymentMethodsRepository
      .createQueryBuilder('p')
      .where('p.userId = :userId', { userId })
      .andWhere('LOWER(p.name) = LOWER(:name)', { name });
    if (excludeId) qb.andWhere('p.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(NAME_CONFLICT_MESSAGE);
    }
  }

  private async saveOrConflict(paymentMethod: PaymentMethod) {
    try {
      return await this.paymentMethodsRepository.save(paymentMethod);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException(NAME_CONFLICT_MESSAGE);
      }
      throw err;
    }
  }
}
