import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
  ParseEnumPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { UpdateCategoryArchiveDto } from './dto/update-category-archive.dto';
import { CategoryType } from './entities/category.entity';

@ApiTags('categories')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a category' })
  @ApiResponse({ status: 201, description: 'Category created' })
  @ApiResponse({ status: 409, description: 'Category name already in use' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCategoryDto,
  ) {
    return this.categoriesService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user categories' })
  @ApiQuery({ name: 'type', required: false, enum: CategoryType })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: { userId: string },
    @Query('type', new ParseEnumPipe(CategoryType, { optional: true }))
    type?: CategoryType,
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ) {
    return this.categoriesService.findAllByUser(user.userId, {
      type,
      includeArchived: includeArchived ?? false,
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one category' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.categoriesService.findOwned(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a category (type cannot be changed)' })
  @ApiResponse({ status: 409, description: 'Category name already in use' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categoriesService.update(user.userId, id, dto);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive or unarchive a category' })
  setArchived(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCategoryArchiveDto,
  ) {
    return this.categoriesService.setArchived(user.userId, id, dto.isArchived);
  }
}
