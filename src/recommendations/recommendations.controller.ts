import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RecommendationsQueryDto } from './dto/recommendations-query.dto';
import { RecommendationsService } from './recommendations.service';

@ApiTags('recommendations')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('recommendations')
export class RecommendationsController {
  constructor(private readonly recommendations: RecommendationsService) {}

  @Get()
  @ApiOperation({
    summary:
      'Monthly savings suggestions, budget warnings and unusual category spending',
  })
  list(
    @CurrentUser() user: { userId: string },
    @Query() query: RecommendationsQueryDto,
  ) {
    return this.recommendations.findAll(user.userId, query.month);
  }
}
