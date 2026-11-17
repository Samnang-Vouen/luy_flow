import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BudgetsService } from './budgets.service';
import {
  CreateBudgetDto,
  ListBudgetsQueryDto,
  UpdateBudgetDto,
} from './dto/create-budget.dto';

@ApiTags('budgets')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create an overall or category monthly spending budget',
  })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateBudgetDto,
  ) {
    return this.budgets.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List your budgets, optionally filtered by month' })
  list(
    @CurrentUser() user: { userId: string },
    @Query() query: ListBudgetsQueryDto,
  ) {
    return this.budgets.findAll(user.userId, query.month);
  }

  @Get(':id/progress')
  @ApiOperation({
    summary:
      'Compare budget with actual expenses in its month, category and currency',
  })
  progress(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.budgets.progress(user.userId, id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get your budget' })
  get(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.budgets.findOwned(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update your budget' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
  ) {
    return this.budgets.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete your budget without changing transactions' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.budgets.delete(user.userId, id);
  }
}
