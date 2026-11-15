import {
  Body,
  Controller,
  Get,
  Param,
  ParseBoolPipe,
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
import { CreatePaymentMethodDto } from './dto/create-payment-method.dto';
import { UpdatePaymentMethodDto } from './dto/update-payment-method.dto';
import { UpdatePaymentMethodArchiveDto } from './dto/update-payment-method-archive.dto';
import { PaymentMethodsService } from './payment-methods.service';

@ApiTags('payment-methods')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('payment-methods')
export class PaymentMethodsController {
  constructor(private readonly paymentMethodsService: PaymentMethodsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a payment method' })
  @ApiResponse({ status: 201, description: 'Payment method created' })
  @ApiResponse({ status: 409, description: 'Payment method name already in use' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user payment methods' })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: { userId: string },
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ) {
    return this.paymentMethodsService.findAllByUser(
      user.userId,
      includeArchived ?? false,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one payment method' })
  @ApiResponse({ status: 404, description: 'Payment method not found' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.paymentMethodsService.findOwned(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Rename a payment method' })
  @ApiResponse({ status: 409, description: 'Payment method name already in use' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodDto,
  ) {
    return this.paymentMethodsService.update(user.userId, id, dto);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive or unarchive a payment method' })
  setArchived(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentMethodArchiveDto,
  ) {
    return this.paymentMethodsService.setArchived(
      user.userId,
      id,
      dto.isArchived,
    );
  }
}
