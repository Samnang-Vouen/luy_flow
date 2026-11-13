import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateRecurringTransactionDto } from './dto/create-recurring-transaction.dto';
import { UpdateRecurringTransactionDto } from './dto/update-recurring-transaction.dto';
import { UpdateRecurringTransactionStatusDto } from './dto/update-recurring-transaction-status.dto';
import { RecurringTransactionsService } from './recurring-transactions.service';

@ApiTags('recurring-transactions')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('recurring-transactions')
export class RecurringTransactionsController {
  constructor(
    private readonly recurringTransactionsService: RecurringTransactionsService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a recurring transaction schedule' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateRecurringTransactionDto,
  ) {
    return this.recurringTransactionsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user recurring schedules' })
  findAll(@CurrentUser() user: { userId: string }) {
    return this.recurringTransactionsService.findAllByUser(user.userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a recurring transaction schedule' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringTransactionDto,
  ) {
    return this.recurringTransactionsService.update(user.userId, id, dto);
  }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Pause or resume a recurring transaction schedule' })
  updateStatus(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRecurringTransactionStatusDto,
  ) {
    return this.recurringTransactionsService.updateStatus(
      user.userId,
      id,
      dto.status,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a recurring transaction schedule' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.recurringTransactionsService.delete(user.userId, id);
  }
}
