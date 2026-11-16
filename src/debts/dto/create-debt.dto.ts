import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';
import { DebtDirection } from '../entities/debt.entity';

export class CreateDebtDto {
  @ApiProperty({ maxLength: 120, example: 'Sokha' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  counterparty: string;

  @ApiProperty({ enum: DebtDirection })
  @IsEnum(DebtDirection)
  direction: DebtDirection;

  @ApiProperty({ example: 500 })
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  principalAmount: number;

  @ApiPropertyOptional({ example: 5, description: 'Percent, 0 to 100' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  interestRate?: number | null;

  @ApiPropertyOptional({ example: '2027-01-01', nullable: true })
  @IsOptional()
  @IsDateString()
  dueDate?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string | null;
}
