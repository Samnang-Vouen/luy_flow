import { ApiProperty } from '@nestjs/swagger';
import { Matches } from 'class-validator';

export class RecommendationsQueryDto {
  @ApiProperty({
    example: '2026-11',
    description:
      'Calendar month to analyze; no forecast or currency conversion.',
  })
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/)
  month: string;
}
