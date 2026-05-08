import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Get()
  async findAll(
    @Query('workspaceId') workspaceId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.budgetsService.findAll(+workspaceId, month ? +month : undefined, year ? +year : undefined);
  }

  @Get('progress')
  async progress(@Query('workspaceId') workspaceId: string) {
    return this.budgetsService.getBudgetProgress(+workspaceId);
  }

  @Post()
  async upsert(@Body() body: { workspaceId: number; categoryId: number; amount: number; currency: string; month: number; year: number }) {
    return this.budgetsService.upsert(body.workspaceId, body.categoryId, body.amount, body.currency, body.month, body.year);
  }
}
