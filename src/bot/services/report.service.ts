import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ReportService {
  constructor(private readonly prisma: PrismaService) {}

  async getReport(workspaceId: number, reportType: string, period: string) {
    const { from, to, label } = this.getPeriodDates(period);

    switch (reportType) {
      case 'income':       return this.getIncomeSummary(workspaceId, from, to, label);
      case 'expense':      return this.getExpenseSummary(workspaceId, from, to, label);
      case 'top_expense':  return this.getTopCategories(workspaceId, from, to, 'EXPENSE', label);
      case 'top_income':   return this.getTopCategories(workspaceId, from, to, 'INCOME', label);
      case 'by_category':
      case 'balance':
      default:             return this.getBalance(workspaceId, from, to, label);
    }
  }

  private getPeriodDates(period: string) {
    const now = new Date();
    switch (period) {
      case 'today':
        return {
          from: new Date(now.getFullYear(), now.getMonth(), now.getDate()),
          to: now,
          label: { uz: 'Bugun', ru: 'Сегодня', en: 'Today' },
        };
      case 'week': {
        const mon = new Date(now);
        mon.setDate(now.getDate() - now.getDay() + 1);
        return { from: mon, to: now, label: { uz: 'Bu hafta', ru: 'Эта неделя', en: 'This week' } };
      }
      case 'year':
        return {
          from: new Date(now.getFullYear(), 0, 1),
          to: now,
          label: { uz: 'Bu yil', ru: 'Этот год', en: 'This year' },
        };
      default:
        return {
          from: new Date(now.getFullYear(), now.getMonth(), 1),
          to: now,
          label: { uz: 'Bu oy', ru: 'Этот месяц', en: 'This month' },
        };
    }
  }

  private async getBalance(wsId: number, from: Date, to: Date, label: any) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: { workspaceId: wsId, date: { gte: from, lte: to } },
      _sum: { amountUzs: true },
    });
    const income = Number(rows.find(r => r.type === 'INCOME')?._sum.amountUzs ?? 0);
    const expense = Number(rows.find(r => r.type === 'EXPENSE')?._sum.amountUzs ?? 0);
    return { type: 'balance', income, expense, net: income - expense, label };
  }

  private async getTopCategories(wsId: number, from: Date, to: Date, txType: string, label: any) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { workspaceId: wsId, type: txType as any, date: { gte: from, lte: to } },
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: 'desc' } },
      take: 5,
    });

    const withNames = await Promise.all(
      rows.map(async r => {
        const cat = await this.prisma.category.findUnique({ where: { id: r.categoryId } });
        return { name: cat!, amount: Number(r._sum.amountUzs ?? 0) };
      }),
    );

    return { type: 'top', txType, items: withNames, label };
  }

  private async getIncomeSummary(wsId: number, from: Date, to: Date, label: any) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { workspaceId: wsId, type: 'INCOME', date: { gte: from, lte: to } },
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: 'desc' } },
    });
    const total = rows.reduce((s, r) => s + Number(r._sum.amountUzs ?? 0), 0);
    const withNames = await Promise.all(
      rows.map(async r => {
        const cat = await this.prisma.category.findUnique({ where: { id: r.categoryId } });
        return { name: cat!, amount: Number(r._sum.amountUzs ?? 0) };
      }),
    );
    return { type: 'income', total, items: withNames, label };
  }

  private async getExpenseSummary(wsId: number, from: Date, to: Date, label: any) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: { workspaceId: wsId, type: 'EXPENSE', date: { gte: from, lte: to } },
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: 'desc' } },
    });
    const total = rows.reduce((s, r) => s + Number(r._sum.amountUzs ?? 0), 0);
    const withNames = await Promise.all(
      rows.map(async r => {
        const cat = await this.prisma.category.findUnique({ where: { id: r.categoryId } });
        return { name: cat!, amount: Number(r._sum.amountUzs ?? 0) };
      }),
    );
    return { type: 'expense', total, items: withNames, label };
  }
}
