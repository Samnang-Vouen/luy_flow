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
import { AccountsService } from './accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { UpdateAccountArchiveDto } from './dto/update-account-archive.dto';

@ApiTags('accounts')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accountsService: AccountsService) {}

  @Post()
  @ApiOperation({ summary: 'Create an account' })
  @ApiResponse({ status: 201, description: 'Account created' })
  @ApiResponse({ status: 409, description: 'Account name already in use' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateAccountDto,
  ) {
    return this.accountsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user accounts' })
  @ApiQuery({ name: 'includeArchived', required: false, type: Boolean })
  findAll(
    @CurrentUser() user: { userId: string },
    @Query('includeArchived', new ParseBoolPipe({ optional: true }))
    includeArchived?: boolean,
  ) {
    return this.accountsService.findAllByUser(
      user.userId,
      includeArchived ?? false,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one account' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.accountsService.findOwned(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an account (currency cannot be changed)' })
  @ApiResponse({ status: 409, description: 'Account name already in use' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
  ) {
    return this.accountsService.update(user.userId, id, dto);
  }

  @Patch(':id/archive')
  @ApiOperation({ summary: 'Archive or unarchive an account' })
  setArchived(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountArchiveDto,
  ) {
    return this.accountsService.setArchived(user.userId, id, dto.isArchived);
  }
}
