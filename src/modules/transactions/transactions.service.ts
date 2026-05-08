import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';

export interface CreateTransactionDto {
  workspaceId: number;
  amount: number;
  currency?: 'UZS' | 'USD';
  type: 'INCOME' | 'EXPENSE';
  categoryId: number;
  note?: string;
  date?: Date;
  source?: 'TELEGRAM' | 'MANUAL' | 'API';
  userId: number;
  exchangeRate?: number;
  amountUzs?: number;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateTransactionDto) {
    return this.prisma.transaction.create({
      data: {
        workspaceId: dto.workspaceId,
        amount: dto.amount,
        currency: dto.currency ?? 'UZS',
        amountUzs: dto.amountUzs ?? dto.amount,
        exchangeRate: dto.exchangeRate ?? null,
        type: dto.type,
        categoryId: dto.categoryId,
        noteUz: dto.note ?? null,
        noteRu: dto.note ?? null,
        noteEn: dto.note ?? null,
        date: dto.date ?? new Date(),
        source: dto.source ?? 'MANUAL',
        userId: dto.userId,
      },
      include: { category: true, user: true },
    });
  }

  async findAll(workspaceId: number, filters: {
    type?: 'INCOME' | 'EXPENSE';
    categoryId?: number;
    from?: Date;
    to?: Date;
    page?: number;
    limit?: number;
  } = {}) {
    const { page = 1, limit = 20, ...where } = filters;
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: {
          workspaceId,
          ...(where.type && { type: where.type }),
          ...(where.categoryId && { categoryId: where.categoryId }),
          ...(where.from || where.to ? { date: { gte: where.from, lte: where.to } } : {}),
        },
        include: { category: true, user: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where: { workspaceId } }),
    ]);

    return { items, total, page, limit };
  }

  async summary(workspaceId: number, from?: Date, to?: Date) {
    const rows = await this.prisma.transaction.groupBy({
      by: ['type'],
      where: {
        workspaceId,
        ...(from || to ? { date: { gte: from, lte: to } } : {}),
      },
      _sum: { amountUzs: true },
    });

    const income = Number(rows.find(r => r.type === 'INCOME')?._sum.amountUzs ?? 0);
    const expense = Number(rows.find(r => r.type === 'EXPENSE')?._sum.amountUzs ?? 0);
    return { income, expense, net: income - expense };
  }

  async findOne(id: number) {
    return this.prisma.transaction.findUnique({
      where: { id },
      include: { category: true, user: true },
    });
  }

  async update(id: number, userId: number, role: string, data: Partial<CreateTransactionDto>) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException();
    if (tx.userId !== userId && role === 'MEMBER') throw new ForbiddenException();

    return this.prisma.transaction.update({ where: { id }, data: data as any });
  }

  async remove(id: number, userId: number, role: string) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException();
    if (tx.userId !== userId && role === 'MEMBER') throw new ForbiddenException();

    return this.prisma.transaction.delete({ where: { id } });
  }

  async deleteLast(workspaceId: number, userId: number) {
    const last = await this.prisma.transaction.findFirst({
      where: { workspaceId, userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return null;
    return this.prisma.transaction.delete({ where: { id: last.id } });
  }

  async exportCsv(workspaceId: number, from?: Date, to?: Date): Promise<string> {
    const items = await this.prisma.transaction.findMany({
      where: {
        workspaceId,
        ...(from || to ? { date: { gte: from, lte: to } } : {}),
      },
      include: { category: true },
      orderBy: { date: 'desc' },
    });

    const header = 'Date,Type,Category,Amount,Currency,Note';
    const rows = items.map(t =>
      `${t.date.toISOString()},${t.type},${t.category.nameEn},${t.amount},${t.currency},${t.noteEn ?? ''}`,
    );

    return [header, ...rows].join('\n');
  }
}
