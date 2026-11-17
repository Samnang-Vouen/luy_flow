import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsISO4217CurrencyCode,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ExternalRefDto {
  @ApiProperty({ maxLength: 40, example: 'tripsplit' })
  @Matches(/^[a-z0-9_-]{1,40}$/, {
    message:
      'source must be 1-40 lowercase letters, digits, hyphens or underscores',
  })
  source: string;

  @ApiProperty({ maxLength: 100, example: '7f3c2a10-5b1e-4c7d-9f2a-1d2e3f4a5b6c' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  id: string;
}

export class CreateSavingsGoalDto {
  @ApiProperty({ maxLength: 120, example: 'Buy a laptop' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 1000 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  targetAmount: number;

  @ApiPropertyOptional({ example: '2027-01-01', nullable: true })
  @IsOptional()
  @IsDateString()
  targetDate?: string | null;

  @ApiPropertyOptional({
    example: 'USD',
    default: 'USD',
    description: 'ISO 4217 code. Cannot be changed after creation.',
  })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toUpperCase() : value,
  )
  @IsISO4217CurrencyCode()
  currency?: string;

  @ApiPropertyOptional({
    type: ExternalRefDto,
    description:
      'Set by another app that creates the goal for the user, e.g. TripSplit with its trip ID. ' +
      'Only one goal per user can have the same source and id. Cannot be changed after creation.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExternalRefDto)
  externalRef?: ExternalRefDto;
}
