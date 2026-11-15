import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { format } from 'date-fns';
import { isUUID } from 'class-validator';
import { QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../../audit-logs/audit-logs.service';
import { PaymentMethodsService } from '../../payment-methods/payment-methods.service';
import {
  PAYMENT_METHOD_MAPPING_KEYS,
  PaymentMethodMappingKey,
} from '../parsers/details.parser';
import { CreateImportProfileDto } from './dto/create-import-profile.dto';
import { UpdateImportProfileDto } from './dto/update-import-profile.dto';
import { ImportProfile } from './entities/import-profile.entity';

const PG_UNIQUE_VIOLATION = '23505';

@Injectable()
export class ImportProfilesService {
  constructor(
    @InjectRepository(ImportProfile)
    private readonly profilesRepository: Repository<ImportProfile>,
    private readonly paymentMethodsService: PaymentMethodsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreateImportProfileDto) {
    const profile = this.profilesRepository.create({
      userId,
      name: dto.name,
      columns: dto.columns,
      dateFormat: dto.dateFormat ?? 'MMM d, yyyy',
      headerRows: dto.headerRows ?? 1,
      channelPaymentMethods: {},
    });
    this.assertDateFormat(profile.dateFormat);
    profile.channelPaymentMethods = await this.validateChannelMapping(
      userId,
      dto.channelPaymentMethods ?? {},
    );

    const saved = await this.saveOrConflict(profile);
    await this.audit(userId, 'import_profile.created', saved.id);
    return saved;
  }

  findAllByUser(userId: string) {
    return this.profilesRepository.find({
      where: { userId },
      order: { name: 'ASC' },
    });
  }

  async findOwned(userId: string, id: string) {
    const profile = await this.profilesRepository.findOne({
      where: { id, userId },
    });
    if (!profile) {
      throw new NotFoundException('Import profile not found');
    }
    return profile;
  }

  async update(userId: string, id: string, dto: UpdateImportProfileDto) {
    const profile = await this.findOwned(userId, id);
    if (dto.name !== undefined) profile.name = dto.name;
    if (dto.columns !== undefined) profile.columns = dto.columns;
    if (dto.headerRows !== undefined) profile.headerRows = dto.headerRows;
    if (dto.dateFormat !== undefined) {
      this.assertDateFormat(dto.dateFormat);
      profile.dateFormat = dto.dateFormat;
    }
    if (dto.channelPaymentMethods !== undefined) {
      profile.channelPaymentMethods = await this.validateChannelMapping(
        userId,
        dto.channelPaymentMethods,
      );
    }
    const saved = await this.saveOrConflict(profile);
    await this.audit(userId, 'import_profile.updated', id);
    return saved;
  }

  /** Profiles are configuration, so they can be deleted; past imports keep working (profileId -> null). */
  async delete(userId: string, id: string): Promise<void> {
    const profile = await this.findOwned(userId, id);
    await this.profilesRepository.remove(profile);
    await this.audit(userId, 'import_profile.deleted', id);
  }

  private assertDateFormat(dateFormat: string) {
    try {
      format(new Date(2026, 0, 31), dateFormat);
    } catch {
      throw new BadRequestException(`Invalid dateFormat "${dateFormat}"`);
    }
  }

  private async validateChannelMapping(
    userId: string,
    mapping: Record<string, string>,
  ): Promise<Partial<Record<PaymentMethodMappingKey, string>>> {
    const result: Partial<Record<PaymentMethodMappingKey, string>> = {};
    for (const [key, paymentMethodId] of Object.entries(mapping)) {
      if (!PAYMENT_METHOD_MAPPING_KEYS.includes(key as PaymentMethodMappingKey)) {
        throw new BadRequestException(
          `Unknown channel "${key}". Allowed: ${PAYMENT_METHOD_MAPPING_KEYS.join(', ')}`,
        );
      }
      if (typeof paymentMethodId !== 'string' || !isUUID(paymentMethodId)) {
        throw new BadRequestException(`Payment method for "${key}" must be a UUID`);
      }
      const paymentMethod = await this.paymentMethodsService.findOwned(
        userId,
        paymentMethodId,
      );
      if (paymentMethod.isArchived) {
        throw new BadRequestException(`Payment method for "${key}" is archived`);
      }
      result[key as PaymentMethodMappingKey] = paymentMethodId;
    }
    return result;
  }

  private async saveOrConflict(profile: ImportProfile) {
    try {
      return await this.profilesRepository.save(profile);
    } catch (err) {
      if (
        err instanceof QueryFailedError &&
        (err.driverError as { code?: string })?.code === PG_UNIQUE_VIOLATION
      ) {
        throw new ConflictException('An import profile with this name already exists');
      }
      throw err;
    }
  }

  private audit(userId: string, action: string, resourceId: string) {
    return this.auditLogsService.record({
      actorUserId: userId,
      action,
      resourceType: 'import_profile',
      resourceId,
    });
  }
}
