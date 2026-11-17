import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';

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
}
