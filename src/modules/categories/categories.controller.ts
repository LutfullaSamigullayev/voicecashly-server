import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Get()
  async findAll(@Query('workspaceId') workspaceId: string) {
    return this.categoriesService.findAll(+workspaceId);
  }

  @Post()
  async create(@Body() body: any) {
    return this.categoriesService.create(body.workspaceId, body);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    return this.categoriesService.update(+id, body);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.categoriesService.remove(+id);
  }
}
