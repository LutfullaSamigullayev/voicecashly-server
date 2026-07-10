import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WorkspaceAccessService } from '../../shared/workspace-access/workspace-access.service';
import { ExchangeRatesService } from '../exchange-rates/exchange-rates.service';

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

export interface UpdateTransactionData {
  amount?: number;
  currency?: 'UZS' | 'USD';
  type?: 'INCOME' | 'EXPENSE';
  categoryId?: number;
  note?: string;
  noteUz?: string;
  noteRu?: string;
  noteEn?: string;
  date?: Date | string;
}

@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
    private readonly exchangeRates: ExchangeRatesService,
  ) {}

  async create(dto: CreateTransactionDto) {
    const currency = dto.currency ?? 'UZS';
    let amountUzs = dto.amountUzs;
    let exchangeRate = dto.exchangeRate ?? null;

    // Bot amountUzs'ni o'zi hisoblab yuboradi; web/API yubormasa shu yerda normallashtiramiz
    if (amountUzs == null) {
      if (currency === 'UZS') {
        amountUzs = dto.amount;
      } else {
        exchangeRate = exchangeRate ?? (await this.exchangeRates.getRate(currency, 'UZS'));
        amountUzs = dto.amount * exchangeRate;
      }
    }

    return this.prisma.transaction.create({
      data: {
        workspaceId: dto.workspaceId,
        amount: dto.amount,
        currency,
        amountUzs,
        exchangeRate,
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
    const { page = 1, limit = 20, ...f } = filters;
    const skip = (page - 1) * limit;

    const where = {
      workspaceId,
      ...(f.type && { type: f.type }),
      ...(f.categoryId && { categoryId: f.categoryId }),
      ...(f.from || f.to ? { date: { gte: f.from, lte: f.to } } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where,
        include: { category: true, user: true },
        orderBy: { date: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
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

  async update(id: number, userId: number, data: UpdateTransactionData) {
    const tx = await this.assertCanModify(id, userId);

    const upd: Record<string, unknown> = {};
    if (data.amount !== undefined) upd.amount = data.amount;
    if (data.currency !== undefined) upd.currency = data.currency;
    if (data.type !== undefined) upd.type = data.type;
    if (data.categoryId !== undefined) upd.categoryId = data.categoryId;
    if (data.date !== undefined) upd.date = new Date(data.date);
    if (data.noteUz !== undefined) upd.noteUz = data.noteUz;
    if (data.noteRu !== undefined) upd.noteRu = data.noteRu;
    if (data.noteEn !== undefined) upd.noteEn = data.noteEn;
    // Web "note" yuboradi — create bilan bir xil: uch tilga ham yoziladi
    if (data.note !== undefined) {
      upd.noteUz = data.note;
      upd.noteRu = data.note;
      upd.noteEn = data.note;
    }

    // amount yoki currency o'zgarsa amountUzs qayta normallashtiriladi,
    // aks holda summary/analytics eski qiymat bilan noto'g'ri chiqadi
    if (data.amount !== undefined || data.currency !== undefined) {
      const amount = data.amount ?? Number(tx.amount);
      const currency = data.currency ?? tx.currency;
      if (currency === 'UZS') {
        upd.amountUzs = amount;
        upd.exchangeRate = null;
      } else {
        const rate = await this.exchangeRates.getRate('USD', 'UZS');
        upd.amountUzs = amount * rate;
        upd.exchangeRate = rate;
      }
    }

    return this.prisma.transaction.update({
      where: { id },
      data: upd,
      include: { category: true, user: true },
    });
  }

  async remove(id: number, userId: number) {
    await this.assertCanModify(id, userId);
    return this.prisma.transaction.delete({ where: { id } });
  }

  // Tranzaksiya egasi hammasini, OWNER/ADMIN boshqalarnikini ham o'zgartira oladi.
  // Workspace a'zosi bo'lmagan foydalanuvchi umuman kira olmaydi.
  private async assertCanModify(id: number, userId: number) {
    const tx = await this.prisma.transaction.findUnique({ where: { id } });
    if (!tx) throw new NotFoundException();
    const role = await this.access.assertMember(tx.workspaceId, userId);
    if (tx.userId !== userId && role === 'MEMBER') throw new ForbiddenException();
    return tx;
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

    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const header = 'Date,Type,Category,Amount,Currency,Note';
    const rows = items.map(t =>
      [
        t.date.toISOString(),
        t.type,
        esc(t.category.nameEn),
        String(t.amount),
        t.currency,
        esc(t.noteEn ?? ''),
      ].join(','),
    );

    return [header, ...rows].join('\n');
  }
}
