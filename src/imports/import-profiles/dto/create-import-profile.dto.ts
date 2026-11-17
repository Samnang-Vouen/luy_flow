import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';
import { PAYMENT_METHOD_MAPPING_KEYS } from '../../parsers/details.parser';

const MAX_COLUMN = 100;

export class ColumnMappingDto {
  @ApiProperty({ example: 0, description: 'Zero-based column index' })
  @IsInt()
  @Min(0)
  @Max(MAX_COLUMN)
  date: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  @Max(MAX_COLUMN)
  details: number;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  @Max(MAX_COLUMN)
  moneyIn: number;

  @ApiProperty({ example: 4 })
  @IsInt()
  @Min(0)
  @Max(MAX_COLUMN)
  moneyOut: number;

  @ApiPropertyOptional({ example: 6, nullable: true })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_COLUMN)
  balance?: number | null;

  @ApiPropertyOptional({
    example: [3, 5, 7],
    description: 'Currency columns checked against the account currency',
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(MAX_COLUMN, { each: true })
  currencies?: number[];
}

export class CreateImportProfileDto {
  @ApiProperty({ maxLength: 60, example: 'ABA statement' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ type: ColumnMappingDto })
  @ValidateNested()
  @Type(() => ColumnMappingDto)
  columns: ColumnMappingDto;

  @ApiPropertyOptional({
    example: 'MMM d, yyyy',
    default: 'MMM d, yyyy',
    description: 'date-fns format for text dates, e.g. "Oct 08, 2026"',
  })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  dateFormat?: string;

  @ApiPropertyOptional({
    example: 1,
    default: 1,
    description: 'Rows to skip before the first transaction row',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(50)
  headerRows?: number;

  @ApiPropertyOptional({
    example: { KHQR: '00000000-0000-0000-0000-000000000000' },
    description: `Map of ${PAYMENT_METHOD_MAPPING_KEYS.join(' / ')} to a payment method id. "KHQR" applies to any row marked KHQR.`,
  })
  @IsOptional()
  @IsObject()
  channelPaymentMethods?: Record<string, string>;
}
