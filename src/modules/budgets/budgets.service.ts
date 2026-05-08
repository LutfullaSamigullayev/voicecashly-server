import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(workspaceId: number, month?: number, year?: number) {
    const now = new Date();
    return this.prisma.budget.findMany({
      where: {
        workspaceId,
        month: month ?? now.getMonth() + 1,
        year: year ?? now.getFullYear(),
      },
      include: { category: true },
    });
  }

  async upsert(workspaceId: number, categoryId: number, amount: number, currency: string, month: number, year: number) {
    return this.prisma.budget.upsert({
      where: { workspaceId_categoryId_month_year: { workspaceId, categoryId, month, year } },
      update: { amount, currency: currency as any },
      create: { workspaceId, categoryId, amount, currency: currency as any, month, year },
    });
  }

  async getBudgetProgress(workspaceId: number) {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 0, 23, 59, 59);

    const budgets = await this.findAll(workspaceId, month, year);

    return Promise.all(
      budgets.map(async b => {
        const rows = await this.prisma.transaction.aggregate({
          where: { workspaceId, categoryId: b.categoryId, type: 'EXPENSE', date: { gte: from, lte: to } },
          _sum: { amountUzs: true },
        });
        const spent = Number(rows._sum.amountUzs ?? 0);
        const limit = Number(b.amount);
        const percent = limit > 0 ? Math.round((spent / limit) * 100) : 0;

        return {
          budget: b,
          spent,
          limit,
          percent,
          status: percent >= 100 ? 'exceeded' : percent >= 80 ? 'warning' : 'ok',
        };
      }),
    );
  }
}
