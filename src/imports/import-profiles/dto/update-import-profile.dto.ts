import { PartialType } from '@nestjs/swagger';
import { CreateImportProfileDto } from './create-import-profile.dto';

export class UpdateImportProfileDto extends PartialType(CreateImportProfileDto) {}
