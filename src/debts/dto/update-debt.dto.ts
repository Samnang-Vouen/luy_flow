import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateDebtDto } from './create-debt.dto';

// principalAmount is fixed after creation; balance changes only through payments.
export class UpdateDebtDto extends PartialType(
  OmitType(CreateDebtDto, ['principalAmount'] as const),
) {}
