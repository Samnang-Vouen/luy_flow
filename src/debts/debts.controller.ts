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
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DebtsService } from './debts.service';
import { CreateDebtPaymentDto } from './dto/create-debt-payment.dto';
import { CreateDebtDto } from './dto/create-debt.dto';
import { ListDebtsQueryDto } from './dto/list-debts-query.dto';
import { UpdateDebtDto } from './dto/update-debt.dto';

@ApiTags('debts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('debts')
export class DebtsController {
  constructor(private readonly debtsService: DebtsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a debt' })
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateDebtDto) {
    return this.debtsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my debts (filter by status or direction)' })
  findAll(
    @CurrentUser() user: { userId: string },
    @Query() query: ListDebtsQueryDto,
  ) {
    return this.debtsService.findAll(user.userId, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one debt' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.debtsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a debt' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateDebtDto,
  ) {
    return this.debtsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a debt' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.debtsService.delete(user.userId, id);
  }

  @Post(':id/payments')
  @ApiOperation({ summary: 'Record a payment on a debt' })
  pay(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateDebtPaymentDto,
  ) {
    return this.debtsService.pay(user.userId, id, dto);
  }

  @Get(':id/payments')
  @ApiOperation({ summary: 'List payments of a debt' })
  findPayments(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.debtsService.findPayments(user.userId, id);
  }
}
