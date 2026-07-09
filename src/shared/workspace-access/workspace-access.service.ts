import { Injectable, ForbiddenException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WorkspaceAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async getRole(workspaceId: number, userId: number): Promise<Role | null> {
    const member = await this.prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async assertMember(workspaceId: number, userId: number): Promise<Role> {
    const role = await this.getRole(workspaceId, userId);
    if (!role) throw new ForbiddenException('Not a member of this workspace');
    return role;
  }
}
