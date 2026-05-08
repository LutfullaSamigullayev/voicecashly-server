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
        name: `${user.firstName} hisobi`,
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

  async generateInviteLink(workspaceId: number, userId: number): Promise<string> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
    });
    if (!member || member.role !== 'OWNER') throw new ForbiddenException('Only owner can invite');

    const workspace = await this.prisma.workspace.findUnique({ where: { id: workspaceId } });
    return `${process.env.WEBHOOK_URL?.replace('-server', '')}/join/${workspace?.inviteCode}`;
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
