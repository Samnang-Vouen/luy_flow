import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ImportRowStatus } from '../entities/import-row.entity';

/** Changes made in the preview before confirming. Send null to clear a field. */
export class UpdateImportRowDto {
  @ApiPropertyOptional({ description: 'Include this row when confirming' })
  @IsOptional()
  @IsBoolean()
  selected?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsUUID()
  paymentMethodId?: string | null;

  @ApiPropertyOptional({ maxLength: 255, nullable: true })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MaxLength(255)
  description?: string | null;
}

export class ListImportRowsQueryDto {
  @ApiPropertyOptional({ enum: ImportRowStatus })
  @IsOptional()
  @IsEnum(ImportRowStatus)
  status?: ImportRowStatus;
}
