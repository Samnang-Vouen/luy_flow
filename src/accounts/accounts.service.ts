import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { Account } from './entities/account.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepository: Repository<Account>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreateAccountDto) {
    await this.assertNameAvailable(userId, dto.name);
    const account = await this.saveOrConflict(
      this.accountsRepository.create({
        ...dto,
        openingBalance: (dto.openingBalance ?? 0).toFixed(2),
        userId,
      }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'account.created',
      resourceType: 'account',
      resourceId: account.id,
    });
    return account;
  }

  findAllByUser(userId: string, includeArchived = false) {
    return this.accountsRepository.find({
      where: includeArchived ? { userId } : { userId, isArchived: false },
      order: { createdAt: 'ASC' },
    });
  }

  /** Returns the account if it belongs to the user, otherwise 404. Reusable by other modules. */
  async findOwned(userId: string, id: string) {
    const account = await this.accountsRepository.findOne({
      where: { id, userId },
    });
    if (!account) {
      throw new NotFoundException('Account not found');
    }
    return account;
  }

  async update(userId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.findOwned(userId, id);
    if (dto.name !== undefined && dto.name !== account.name) {
      await this.assertNameAvailable(userId, dto.name, id);
    }
    if (dto.name !== undefined) account.name = dto.name;
    if (dto.type !== undefined) account.type = dto.type;
    if (dto.openingBalance !== undefined) {
      account.openingBalance = dto.openingBalance.toFixed(2);
    }
    const updated = await this.saveOrConflict(account);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'account.updated',
      resourceType: 'account',
      resourceId: id,
    });
    return updated;
  }

  async setArchived(userId: string, id: string, isArchived: boolean) {
    const account = await this.findOwned(userId, id);
    account.isArchived = isArchived;
    const updated = await this.accountsRepository.save(account);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: isArchived ? 'account.archived' : 'account.unarchived',
      resourceType: 'account',
      resourceId: id,
    });
    return updated;
  }

  private async assertNameAvailable(
    userId: string,
    name: string,
    excludeId?: string,
  ) {
    const qb = this.accountsRepository
      .createQueryBuilder('a')
      .where('a.userId = :userId', { userId })
      .andWhere('LOWER(a.name) = LOWER(:name)', { name });
    if (excludeId) qb.andWhere('a.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException('An account with this name already exists');
    }
  }

  // The unique index is the real guarantee; this maps a race-condition
  // violation to a 409 instead of a 500.
  private async saveOrConflict(account: Account) {
    try {
      return await this.accountsRepository.save(account);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('An account with this name already exists');
      }
      throw err;
    }
  }
}
