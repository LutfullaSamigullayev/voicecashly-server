import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WorkspaceAccessService } from '../../shared/workspace-access/workspace-access.service';
import { Category } from '@prisma/client';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: WorkspaceAccessService,
  ) {}

  async findAll(workspaceId: number) {
    return this.prisma.category.findMany({
      where: { workspaceId, isArchived: false },
      orderBy: [{ sortOrder: 'asc' }, { nameUz: 'asc' }],
    });
  }

  async getForType(workspaceId: number, txType: 'INCOME' | 'EXPENSE') {
    return this.prisma.category.findMany({
      where: {
        workspaceId,
        isArchived: false,
        type: { in: [txType, 'BOTH'] },
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findBestMatch(
    hint: string,
    workspaceId: number,
    txType: 'INCOME' | 'EXPENSE',
  ): Promise<{ exact: Category | null; similar: Category | null }> {
    const categories = await this.prisma.category.findMany({
      where: {
        workspaceId,
        isArchived: false,
        type: { in: [txType, 'BOTH'] },
      },
    });

    const exact = categories.find(
      c =>
        c.nameUz.toLowerCase() === hint.toLowerCase() ||
        c.nameRu.toLowerCase() === hint.toLowerCase() ||
        c.nameEn.toLowerCase() === hint.toLowerCase(),
    ) ?? null;

    if (exact) return { exact, similar: null };

    const similar = categories.find(
      c =>
        c.nameUz.toLowerCase().includes(hint.toLowerCase()) ||
        hint.toLowerCase().includes(c.nameUz.toLowerCase()) ||
        c.nameRu.toLowerCase().includes(hint.toLowerCase()) ||
        hint.toLowerCase().includes(c.nameRu.toLowerCase()) ||
        c.nameEn.toLowerCase().includes(hint.toLowerCase()) ||
        hint.toLowerCase().includes(c.nameEn.toLowerCase()),
    ) ?? null;

    return { exact: null, similar };
  }

  async create(workspaceId: number, data: {
    nameUz: string; nameRu: string; nameEn: string;
    type: 'INCOME' | 'EXPENSE' | 'BOTH'; color?: string; icon?: string;
  }) {
    return this.prisma.category.create({
      data: { workspaceId, ...data, color: data.color ?? '#1D9E75', icon: data.icon ?? 'tag' },
    });
  }

  async createFromHint(hint: string, workspaceId: number, txType: 'INCOME' | 'EXPENSE'): Promise<Category> {
    return this.prisma.category.create({
      data: {
        workspaceId,
        nameUz: hint,
        nameRu: hint,
        nameEn: hint,
        type: txType,
        color: txType === 'INCOME' ? '#1D9E75' : '#D85A30',
        icon: 'tag',
        isDefault: false,
      },
    });
  }

  async update(id: number, data: Partial<{ nameUz: string; nameRu: string; nameEn: string; color: string; icon: string; isArchived: boolean; sortOrder: number }>) {
    return this.prisma.category.update({ where: { id }, data });
  }

  async remove(id: number) {
    return this.prisma.category.update({ where: { id }, data: { isArchived: true } });
  }

  // REST uchun: kategoriya qaysi workspace'ga tegishliligini aniqlab,
  // foydalanuvchi shu workspace'da OWNER/ADMIN ekanini tekshiradi
  async updateChecked(id: number, userId: number, data: Parameters<CategoriesService['update']>[1]) {
    await this.assertManager(id, userId);
    return this.update(id, data);
  }

  async removeChecked(id: number, userId: number) {
    await this.assertManager(id, userId);
    return this.remove(id);
  }

  private async assertManager(categoryId: number, userId: number) {
    const cat = await this.prisma.category.findUnique({ where: { id: categoryId } });
    if (!cat) throw new NotFoundException('Category not found');
    await this.access.assertRole(cat.workspaceId, userId, ['OWNER', 'ADMIN']);
    return cat;
  }
}
