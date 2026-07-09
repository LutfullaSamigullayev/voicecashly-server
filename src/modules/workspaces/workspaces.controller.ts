import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, BadRequestException } from '@nestjs/common';
import { WorkspacesService } from './workspaces.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateWorkspaceDto, JoinWorkspaceDto, RenameWorkspaceDto } from './dto/workspace.dto';

@UseGuards(JwtAuthGuard)
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get('me')
  async myWorkspaces(@Req() req: any) {
    return this.workspacesService.getUserWorkspaces(req.user.sub);
  }

  @Post()
  async create(@Req() req: any, @Body() body: CreateWorkspaceDto) {
    if (body.type === 'personal') {
      return this.workspacesService.createPersonalWorkspace(req.user.sub);
    }
    if (!body.name?.trim()) throw new BadRequestException('Team name is required');
    return this.workspacesService.createTeamWorkspace(req.user.sub, body.name.trim());
  }

  @Post('join')
  async join(@Req() req: any, @Body() body: JoinWorkspaceDto) {
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

  // OWNER yoki ADMIN — rol tekshiruvi service ichida
  @Patch(':id')
  async rename(@Req() req: any, @Param('id') id: string, @Body() body: RenameWorkspaceDto) {
    return this.workspacesService.renameWorkspace(+id, req.user.sub, body.name.trim());
  }
}
