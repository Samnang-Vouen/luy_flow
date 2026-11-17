import { ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';
import { SavingsGoalStatus } from '../entities/savings-goal.entity';
import { CreateSavingsGoalDto } from './create-savings-goal.dto';

export class UpdateSavingsGoalDto extends PartialType(CreateSavingsGoalDto) {
  @ApiPropertyOptional({
    enum: [SavingsGoalStatus.ACTIVE, SavingsGoalStatus.CANCELLED],
    description:
      'A goal becomes completed automatically; it cannot be set here.',
  })
  @IsOptional()
  @IsIn([SavingsGoalStatus.ACTIVE, SavingsGoalStatus.CANCELLED])
  status?: SavingsGoalStatus.ACTIVE | SavingsGoalStatus.CANCELLED;
}
