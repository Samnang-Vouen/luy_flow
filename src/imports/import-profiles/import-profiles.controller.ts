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
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CreateImportProfileDto } from './dto/create-import-profile.dto';
import { UpdateImportProfileDto } from './dto/update-import-profile.dto';
import { ImportProfilesService } from './import-profiles.service';

@ApiTags('import-profiles')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('import-profiles')
export class ImportProfilesController {
  constructor(private readonly profilesService: ImportProfilesService) {}

  @Post()
  @ApiOperation({ summary: 'Create a bank statement import profile (column mapping)' })
  @ApiResponse({ status: 409, description: 'Profile name already in use' })
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateImportProfileDto,
  ) {
    return this.profilesService.create(user.userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List the current user import profiles' })
  findAll(@CurrentUser() user: { userId: string }) {
    return this.profilesService.findAllByUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one import profile' })
  findOne(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profilesService.findOwned(user.userId, id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an import profile' })
  update(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateImportProfileDto,
  ) {
    return this.profilesService.update(user.userId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an import profile (past imports are kept)' })
  delete(
    @CurrentUser() user: { userId: string },
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.profilesService.delete(user.userId, id);
  }
}
