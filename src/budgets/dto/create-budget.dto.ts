import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsISO4217CurrencyCode,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateBudgetDto {
  @ApiProperty({ example: '2026-11' })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;

  @ApiProperty({ example: 'USD' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency: string;

  @ApiProperty({ example: 300, minimum: 0.01, maximum: 999999999999.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999999999.99)
  amount: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Omit or use null for an overall monthly budget.',
  })
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}

// Null is allowed only for categoryId, not for required budget fields.
export class UpdateBudgetDto extends PartialType(CreateBudgetDto, {
  skipNullProperties: false,
}) {}

export class ListBudgetsQueryDto {
  @ApiPropertyOptional({ example: '2026-11' })
  @ValidateIf((_object, value) => value !== undefined)
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month?: string;
}
