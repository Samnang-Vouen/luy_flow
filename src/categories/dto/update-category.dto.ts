import { OmitType, PartialType } from '@nestjs/swagger';
import { CreateCategoryDto } from './create-category.dto';

// Type is intentionally not updatable: switching income <-> expense would
// leave existing transactions under a category of the wrong kind.
export class UpdateCategoryDto extends PartialType(
  OmitType(CreateCategoryDto, ['type'] as const),
) {}
