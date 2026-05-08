import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { defaultCategories } from '../../../prisma/seed';

@Injectable()
export class WorkspacesService {
  constructor(private readonly prisma: PrismaService) {}

  async createPersonalWorkspace(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const workspace = await this.prisma.workspace.create({
      data: {
        name: user.firstName,
        isPersonal: true,
        inviteCode: null,
        members: { create: { userId, role: 'OWNER' } },
        settings: { create: { defaultCurrency: 'UZS' } },
      },
    });

    await this.seedDefaultCategories(workspace.id);
    return workspace;
  }

  async createTeamWorkspace(ownerId: number, name: string) {
    const workspace = await this.prisma.workspace.create({
      data: {
        name,
        isPersonal: false,
        inviteCode: Math.random().toString(36).slice(2, 8).toUpperCase(),
        members: { create: { userId: ownerId, role: 'OWNER' } },
        settings: { create: { defaultCurrency: 'UZS' } },
      },
    });

    await this.seedDefaultCategories(workspace.id);
    return workspace;
  }

  async joinByInviteCode(userId: number, inviteCode: string) {
    const workspace = await this.prisma.workspace.findUnique({ where: { inviteCode } });
    if (!workspace) throw new NotFoundException('Workspace not found');
    if (workspace.isPersonal) throw new ForbiddenException('Cannot join personal workspace');

    const existing = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    });
    if (existing) return workspace;

    await this.prisma.workspaceMember.create({
      data: { workspaceId: workspace.id, userId, role: 'MEMBER' },
    });

    return workspace;
  }

  async getUserWorkspaces(userId: number) {
    return this.prisma.workspaceMember.findMany({
      where: { userId },
      include: { workspace: { include: { settings: true } } },
    });
  }

  async getWorkspace(workspaceId: number, userId: number) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      include: { workspace: { include: { settings: true, members: { include: { user: true } } } } },
    });
    if (!member) throw new ForbiddenException('Access denied');
    return member.workspace;
  }

  async getInviteCode(workspaceId: number, userId: number): Promise<string> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member || member.role !== 'OWNER') throw new ForbiddenException('Only owner can invite');

    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    if (!workspace?.inviteCode) throw new ForbiddenException('No invite code (personal workspace)');
    return workspace.inviteCode;
  }

  async renameWorkspace(wsId: number, userId: number, newName: string) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: wsId, userId } },
    });
    if (!member || (member.role !== 'OWNER' && member.role !== 'ADMIN')) {
      throw new ForbiddenException('Only owner or admin can rename workspace');
    }
    return this.prisma.workspace.update({ where: { id: wsId }, data: { name: newName } });
  }

  async deleteWorkspace(wsId: number, userId: number) {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId: wsId, userId } },
    });
    if (!member || member.role !== 'OWNER') throw new ForbiddenException('Only owner can delete workspace');

    const otherCount = await this.prisma.workspaceMember.count({
      where: { userId, workspaceId: { not: wsId } },
    });
    if (otherCount === 0) throw new ForbiddenException('Cannot delete your only workspace');

    const categories = await this.prisma.category.findMany({
      where: { workspaceId: wsId },
      select: { id: true },
    });
    const catIds = categories.map(c => c.id);

    await this.prisma.$transaction([
      this.prisma.transaction.updateMany({ where: { workspaceId: wsId }, data: { recurringId: null } }),
      this.prisma.recurringTransaction.deleteMany({ where: { categoryId: { in: catIds } } }),
      this.prisma.budget.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.transaction.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.category.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.workspaceSettings.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.workspaceMember.deleteMany({ where: { workspaceId: wsId } }),
      this.prisma.workspace.delete({ where: { id: wsId } }),
    ]);
  }

  private async seedDefaultCategories(workspaceId: number) {
    await this.prisma.category.createMany({
      data: defaultCategories.map((c, i) => ({
        workspaceId,
        nameUz: c.nameUz,
        nameRu: c.nameRu,
        nameEn: c.nameEn,
        type: c.type as any,
        color: c.color,
        icon: c.icon,
        isDefault: true,
        sortOrder: i,
      })),
    });
  }
}
