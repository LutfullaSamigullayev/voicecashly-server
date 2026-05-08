import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async monthly(workspaceId: number, months = 6) {
    const result: any[] = [];
    const now = new Date();

    for (let i = months - 1; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 0, 23, 59, 59);

      const rows = await this.prisma.transaction.groupBy({
        by: ['type'],
        where: { workspaceId, date: { gte: from, lte: to } },
        _sum: { amountUzs: true },
      });

      const income = Number(rows.find(r => r.type === 'INCOME')?._sum.amountUzs ?? 0);
      const expense = Number(rows.find(r => r.type === 'EXPENSE')?._sum.amountUzs ?? 0);

      result.push({
        month: from.toISOString().slice(0, 7),
        income,
        expense,
        net: income - expense,
      });
    }

    return result;
  }

  async byCategory(workspaceId: number, type: 'INCOME' | 'EXPENSE', from?: Date, to?: Date) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['categoryId'],
      where: {
        workspaceId,
        type,
        ...(from || to ? { date: { gte: from, lte: to } } : {}),
      },
      _sum: { amountUzs: true },
      orderBy: { _sum: { amountUzs: 'desc' } },
    });

    return Promise.all(
      rows.map(async r => {
        const cat = await this.prisma.category.findUnique({ where: { id: r.categoryId } });
        return {
          categoryId: r.categoryId,
          nameUz: cat?.nameUz,
          nameRu: cat?.nameRu,
          nameEn: cat?.nameEn,
          color: cat?.color,
          amount: Number(r._sum.amountUzs ?? 0),
        };
      }),
    );
  }
}
