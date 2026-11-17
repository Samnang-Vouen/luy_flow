import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ReportQueryDto } from './dto/report-query.dto';
import { ReportsService } from './reports.service';

@ApiTags('reports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Income, expenses, surplus and savings rate per currency',
  })
  summary(
    @CurrentUser() user: { userId: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.summary(user.userId, query);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Income and expenses by category and currency' })
  categories(
    @CurrentUser() user: { userId: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.byCategory(user.userId, query);
  }

  @Get('trends')
  @ApiOperation({
    summary: 'Daily, weekly, monthly or annual totals; weeks start Monday',
  })
  trends(
    @CurrentUser() user: { userId: string },
    @Query() query: ReportQueryDto,
  ) {
    return this.reports.trends(user.userId, query);
  }
}
