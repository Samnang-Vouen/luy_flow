import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateCategoryArchiveDto {
  @ApiProperty()
  @IsBoolean()
  isArchived: boolean;
}
