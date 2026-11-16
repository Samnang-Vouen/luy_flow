import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { DebtDirection, DebtStatus } from '../entities/debt.entity';

export class ListDebtsQueryDto {
  @ApiPropertyOptional({ enum: DebtStatus })
  @IsOptional()
  @IsEnum(DebtStatus)
  status?: DebtStatus;

  @ApiPropertyOptional({ enum: DebtDirection })
  @IsOptional()
  @IsEnum(DebtDirection)
  direction?: DebtDirection;
}
