import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, Res, UseGuards } from '@nestjs/common';
import { TransactionsService } from './transactions.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { UpdateTransactionDto } from './dto/update-transaction.dto';
import { QueryTransactionDto } from './dto/query-transaction.dto';
import { Response } from 'express';

@UseGuards(JwtAuthGuard)
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async findAll(@Query() query: QueryTransactionDto) {
    return this.transactionsService.findAll(query.workspaceId, {
      type: query.type,
      categoryId: query.categoryId,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      page: query.page,
      limit: query.limit,
    });
  }

  @Get('summary')
  async summary(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.transactionsService.summary(
      +workspaceId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
  }

  @Get('export')
  async exportCsv(
    @Query('workspaceId') workspaceId: string,
    @Query('from') from: string,
    @Query('to') to: string,
    @Res() res: Response,
  ) {
    const csv = await this.transactionsService.exportCsv(
      +workspaceId,
      from ? new Date(from) : undefined,
      to ? new Date(to) : undefined,
    );
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=transactions.csv');
    return res.send(csv);
  }

  @Post()
  async create(@Req() req: any, @Body() body: CreateTransactionDto) {
    return this.transactionsService.create({
      ...body,
      userId: req.user.sub,
      date: body.date ? new Date(body.date) : undefined,
    });
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: UpdateTransactionDto) {
    return this.transactionsService.update(+id, req.user.sub, 'OWNER', body as any);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    return this.transactionsService.remove(+id, req.user.sub, 'OWNER');
  }
}
