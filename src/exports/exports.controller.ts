import {
  Controller,
  Get,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  ExportTransactionsQueryDto,
  ListExportMonthsQueryDto,
} from './dto/export-transactions-query.dto';
import { ExportsService, MAX_EXPORT_ROWS } from './exports.service';

@ApiTags('exports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get('transactions/months')
  @ApiOperation({
    summary: 'Months that have transactions, newest first (for a month picker)',
  })
  @ApiResponse({
    status: 200,
    description: '[{ "month": "2026-01", "label": "January 2026", "count": 42 }]',
  })
  listMonths(
    @CurrentUser() user: { userId: string },
    @Query() query: ListExportMonthsQueryDto,
  ) {
    return this.exportsService.listMonths(user.userId, query.accountId);
  }

  @Get('transactions')
  @ApiOperation({
    summary:
      'Download transactions as CSV or Excel for a month (month=2026-01) or a custom range, with the same filters as GET /transactions (oldest first)',
  })
  @ApiProduces(
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  )
  @ApiResponse({ status: 200, description: 'File download' })
  @ApiResponse({
    status: 400,
    description: `Invalid filters, or more than ${MAX_EXPORT_ROWS} rows`,
  })
  async exportTransactions(
    @CurrentUser() user: { userId: string },
    @Query() query: ExportTransactionsQueryDto,
  ): Promise<StreamableFile> {
    const file = await this.exportsService.exportTransactions(user.userId, query);
    const options = {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    };
    // CSV is streamed; Excel is a finished buffer.
    return Buffer.isBuffer(file.content)
      ? new StreamableFile(file.content, options)
      : new StreamableFile(file.content, options);
  }
}
