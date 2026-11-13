import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdateAccountArchiveDto {
  @ApiProperty()
  @IsBoolean()
  isArchived: boolean;
}
