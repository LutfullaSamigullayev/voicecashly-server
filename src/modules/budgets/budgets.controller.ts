import { Controller, Get, Post, Body, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { UpsertBudgetDto } from './dto/upsert-budget.dto';

@UseGuards(JwtAuthGuard, WorkspaceMemberGuard)
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
  async upsert(@Req() req: any, @Body() body: UpsertBudgetDto) {
    if (req.workspaceRole === 'MEMBER') {
      throw new ForbiddenException('Only owner or admin can set budgets');
    }
    return this.budgetsService.upsert(body.workspaceId, body.categoryId, body.amount, body.currency, body.month, body.year);
  }
}
