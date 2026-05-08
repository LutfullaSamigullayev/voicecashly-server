import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AnalyticsService } from './analytics.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  @Get('monthly')
  async monthly(@Query('workspaceId') workspaceId: string, @Query('months') months: string) {
    return this.analyticsService.monthly(+workspaceId, months ? +months : 6);
  }

  @Get('by-category')
  async byCategory(
    @Query('workspaceId') workspaceId: string,
    @Query('type') type: 'INCOME' | 'EXPENSE',
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.analyticsService.byCategory(
      +workspaceId,
      type ?? 'EXPENSE',
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }
}
