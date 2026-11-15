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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import {
  CreateImportDto,
  UploadedStatementFile,
} from './dto/create-import.dto';
import {
  ListImportRowsQueryDto,
  UpdateImportRowDto,
} from './dto/update-import-row.dto';
import { ImportsService, MAX_STATEMENT_FILE_BYTES } from './imports.service';

@ApiTags('imports')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('imports')
export class ImportsController {
  constructor(private readonly importsService: ImportsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: MAX_STATEMENT_FILE_BYTES, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file', 'accountId', 'profileId'],
      properties: {
        file: { type: 'string', format: 'binary', description: '.csv or .xlsx, max 5 MB' },
        accountId: { type: 'string', format: 'uuid' },
        profileId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiOperation({
    summary:
      'Upload a bank statement. Processed in the background: poll GET /imports/:id until status is "preview" (or "failed").',
  })
  @ApiResponse({ status: 202, description: 'Import created with status "processing"' })
  @ApiResponse({ status: 400, description: 'Unsupported file type' })
  @ApiResponse({ status: 413, description: 'File larger than 5 MB' })
  @ApiResponse({ status: 503, description: 'Import queue unavailable' })
  upload(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: UploadedStatementFile | undefined,
    @Body() dto: CreateImportDto,
  ) {
    return this.importsService.upload(user.userId, file, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user imports (latest 50)' })
  findAll(@CurrentUser() user: { userId: string }) {
    return this.importsService.findAllByUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get an import summary and status (poll this while processing/confirming)',
  })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importsService.findOwned(user.userId, id);
  }

  @Get(':id/rows')
  @ApiOperation({ summary: 'Preview rows, optionally filtered by status' })
  findRows(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: ListImportRowsQueryDto,
  ) {
    return this.importsService.findRows(user.userId, id, query.status);
  }

  @Patch(':id/rows/:rowId')
  @ApiOperation({
    summary: 'Edit a preview row (select/unselect, category, payment method, description)',
  })
  updateRow(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('rowId', ParseUUIDPipe) rowId: string,
    @Body() dto: UpdateImportRowDto,
  ) {
    return this.importsService.updateRow(user.userId, id, rowId, dto);
  }

  @Post(':id/confirm')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary:
      'Import the selected rows as transactions (all or nothing), in the background. Poll GET /imports/:id until status is "confirmed"; on failure it returns to "preview" with an error.',
  })
  @ApiResponse({ status: 202, description: 'Import status is now "confirming"' })
  @ApiResponse({ status: 503, description: 'Import queue unavailable' })
  confirm(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importsService.requestConfirm(user.userId, id);
  }

  @Delete(':id')
  @ApiOperation({
    summary:
      'Cancel an import that is processing, failed or in preview; or undo a confirmed import (deletes its transactions)',
  })
  @ApiResponse({ status: 409, description: 'Import is being confirmed' })
  remove(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.importsService.remove(user.userId, id);
  }
}
