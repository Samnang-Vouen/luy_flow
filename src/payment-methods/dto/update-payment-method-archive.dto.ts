import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class UpdatePaymentMethodArchiveDto {
  @ApiProperty()
  @IsBoolean()
  isArchived: boolean;
}
