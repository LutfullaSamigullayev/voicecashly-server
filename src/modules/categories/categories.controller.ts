import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { WorkspaceMemberGuard } from '../../common/guards/workspace-member.guard';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @UseGuards(WorkspaceMemberGuard)
  @Get()
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.categoriesService.findAll(+workspaceId);
  }

  @UseGuards(WorkspaceMemberGuard)
  @Post()
  async create(@Req() req: any, @Body() body: CreateCategoryDto) {
    if (req.workspaceRole === 'MEMBER') {
      throw new ForbiddenException('Only owner or admin can create categories');
    }
    return this.categoriesService.create(body.workspaceId, body);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.categoriesService.updateChecked(+id, req.user.sub, body);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.categoriesService.removeChecked(+id, req.user.sub);
  }
}
