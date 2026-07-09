import { Injectable, CanActivate, ExecutionContext, BadRequestException } from '@nestjs/common';
import { WorkspaceAccessService } from '../../shared/workspace-access/workspace-access.service';

/**
 * workspaceId (query/body/X-Workspace-Id header) bo'yicha so'rov yuborayotgan
 * foydalanuvchi shu workspace a'zosi ekanini tekshiradi.
 * JwtAuthGuard'dan KEYIN qo'llanishi shart: @UseGuards(JwtAuthGuard, WorkspaceMemberGuard).
 * Muvaffaqiyatda req.workspaceRole'ga a'zoning roli yoziladi.
 */
@Injectable()
export class WorkspaceMemberGuard implements CanActivate {
  constructor(private readonly access: WorkspaceAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const userId: number | undefined = req.user?.sub;

    const raw =
      req.query?.workspaceId ??
      req.body?.workspaceId ??
      req.headers['x-workspace-id'];
    const workspaceId = Number(raw);

    if (!userId || !raw || Number.isNaN(workspaceId)) {
      throw new BadRequestException('workspaceId is required');
    }

    req.workspaceRole = await this.access.assertMember(workspaceId, userId);
    return true;
  }
}
