import { Controller, Get, Post, Patch, Body, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('auth/telegram')
  async telegramLogin(@Body() body: Record<string, string>) {
    return this.usersService.loginWithTelegram(body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async me(@Req() req: any) {
    return this.usersService.findById(req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  async getSettings(@Req() req: any) {
    const user = await this.usersService.findById(req.user.sub);
    return user?.settings;
  }

  @UseGuards(JwtAuthGuard)
  @Patch('settings')
  async updateSettings(@Req() req: any, @Body() body: any) {
    return this.usersService.updateSettings(req.user.sub, body);
  }
}
