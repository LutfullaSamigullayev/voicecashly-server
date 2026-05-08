import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('me')
  async myWorkspaces(@Req() req: any) {
    return this.workspacesService.getUserWorkspaces(req.user.sub);
  }

  @Post()
  async create(@Req() req: any, @Body() body: { name: string; type: 'personal' | 'team' }) {
    if (body.type === 'personal') {
      return this.workspacesService.createPersonalWorkspace(req.user.sub);
    }
    return this.workspacesService.createTeamWorkspace(req.user.sub, body.name);
  }

  @Post('join')
  async join(@Req() req: any, @Body() body: { inviteCode: string }) {
    return this.workspacesService.joinByInviteCode(req.user.sub, body.inviteCode);
  }

  @Get(':id')
  async getOne(@Req() req: any, @Param('id') id: string) {
    return this.workspacesService.getWorkspace(+id, req.user.sub);
  }

  @Get(':id/invite')
  async inviteLink(@Req() req: any, @Param('id') id: string) {
    const code = await this.workspacesService.getInviteCode(+id, req.user.sub);
    return { code };
  }
}
