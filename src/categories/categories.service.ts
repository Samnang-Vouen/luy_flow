import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { FindOptionsWhere, QueryFailedError, Repository } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { Category, CategoryType } from './entities/category.entity';

const PG_UNIQUE_VIOLATION = '23505';
const NAME_CONFLICT_MESSAGE = 'A category with this name and type already exists';

export interface FindCategoriesOptions {
  type?: CategoryType;
  includeArchived?: boolean;
}

@Injectable()
export class CategoriesService {
  constructor(
    @InjectRepository(Category)
    private readonly categoriesRepository: Repository<Category>,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async create(userId: string, dto: CreateCategoryDto) {
    await this.assertNameAvailable(userId, dto.type, dto.name);
    const category = await this.saveOrConflict(
      this.categoriesRepository.create({ ...dto, userId }),
    );
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'category.created',
      resourceType: 'category',
      resourceId: category.id,
    });
    return category;
  }

  findAllByUser(userId: string, options: FindCategoriesOptions = {}) {
    const where: FindOptionsWhere<Category> = { userId };
    if (options.type) where.type = options.type;
    if (!options.includeArchived) where.isArchived = false;
    return this.categoriesRepository.find({
      where,
      order: { type: 'ASC', name: 'ASC' },
    });
  }

  /** Returns the category if it belongs to the user, otherwise 404.*/
  async findOwned(userId: string, id: string) {
    const category = await this.categoriesRepository.findOne({
      where: { id, userId },
    });
    if (!category) {
      throw new NotFoundException('Category not found');
    }
    return category;
  }

  async update(userId: string, id: string, dto: UpdateCategoryDto) {
    const category = await this.findOwned(userId, id);
    if (dto.name !== undefined && dto.name !== category.name) {
      await this.assertNameAvailable(userId, category.type, dto.name, id);
      category.name = dto.name;
    }
    const updated = await this.saveOrConflict(category);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: 'category.updated',
      resourceType: 'category',
      resourceId: id,
    });
    return updated;
  }

  async setArchived(userId: string, id: string, isArchived: boolean) {
    const category = await this.findOwned(userId, id);
    category.isArchived = isArchived;
    const updated = await this.categoriesRepository.save(category);
    await this.auditLogsService.record({
      actorUserId: userId,
      action: isArchived ? 'category.archived' : 'category.unarchived',
      resourceType: 'category',
      resourceId: id,
    });
    return updated;
  }

  private async assertNameAvailable(
    userId: string,
    type: CategoryType,
    name: string,
    excludeId?: string,
  ) {
    const qb = this.categoriesRepository
      .createQueryBuilder('c')
      .where('c.userId = :userId', { userId })
      .andWhere('c.type = :type', { type })
      .andWhere('LOWER(c.name) = LOWER(:name)', { name });
    if (excludeId) qb.andWhere('c.id <> :excludeId', { excludeId });
    if (await qb.getExists()) {
      throw new ConflictException(NAME_CONFLICT_MESSAGE);
    }
  }

  // Handle race-condition
  // violation to a 409 instead of a 500.
  private async saveOrConflict(category: Category) {
    try {
      return await this.categoriesRepository.save(category);
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
