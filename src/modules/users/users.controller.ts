import { Controller, Get, Post, Patch, Body, Req, UseGuards, Query } from '@nestjs/common';
import { UsersService } from './users.service';
import { BotAuthService } from './bot-auth.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@Controller()
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly botAuth: BotAuthService,
  ) {}

  @Post('auth/telegram')
  async telegramLogin(@Body() body: Record<string, string>) {
    return this.usersService.loginWithTelegram(body);
  }

  @Post('auth/bot/start')
  async botAuthStart() {
    return this.botAuth.start();
  }

  @Get('auth/bot/check')
  async botAuthCheck(@Query('token') token: string) {
    if (!token) return { status: 'expired' };
    return this.botAuth.check(token);
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
