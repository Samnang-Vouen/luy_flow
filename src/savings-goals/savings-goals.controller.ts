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
import { ContributeDto } from './dto/contribute.dto';
import { CreateSavingsGoalDto } from './dto/create-savings-goal.dto';
import { UpdateSavingsGoalDto } from './dto/update-savings-goal.dto';
import { SavingsGoalsService } from './savings-goals.service';

@ApiTags('savings-goals')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private readonly savingsGoalsService: SavingsGoalsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a savings goal' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateSavingsGoalDto,
  ) {
    return this.savingsGoalsService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List my savings goals' })
  findAll(@CurrentUser() user: { userId: string }) {
    return this.savingsGoalsService.findAll(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one savings goal' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savingsGoalsService.findOne(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a savings goal' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSavingsGoalDto,
  ) {
    return this.savingsGoalsService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a savings goal' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savingsGoalsService.delete(user.userId, id);
  }

  @Post(':id/contributions')
  @ApiOperation({ summary: 'Add money to a savings goal' })
  contribute(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ContributeDto,
  ) {
    return this.savingsGoalsService.contribute(user.userId, id, dto);
  }

  @Get(':id/contributions')
  @ApiOperation({ summary: 'List contributions of a savings goal' })
  findContributions(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.savingsGoalsService.findContributions(user.userId, id);
  }
}
