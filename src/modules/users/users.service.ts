import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { TelegramAuthService } from './telegram-auth.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly telegramAuth: TelegramAuthService,
  ) {}

  async loginWithTelegram(data: Record<string, string>) {
    if (!this.telegramAuth.verify(data)) {
      throw new Error('Invalid Telegram auth data');
    }

    const telegramId = BigInt(data.id);
    let user = await this.prisma.user.findUnique({ where: { telegramId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId,
          firstName: data.first_name,
          lastName: data.last_name ?? null,
          username: data.username ?? null,
          settings: { create: {} },
        },
      });
    }

    const token = this.jwt.sign({ sub: user.id, tid: user.telegramId.toString() });
    return { token, user };
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({
      where: { id },
      include: { settings: true, workspaces: { include: { workspace: true } } },
    });
  }

  async findByTelegramId(telegramId: bigint) {
    return this.prisma.user.findUnique({
      where: { telegramId },
      include: { settings: true, workspaces: { include: { workspace: true } } },
    });
  }

  async updateSettings(userId: number, data: { defaultCurrency?: string; language?: string; timezone?: string; notifyBudget?: boolean; notifyRecurring?: boolean }) {
    return this.prisma.userSettings.upsert({
      where: { userId },
      update: data as any,
      create: { userId, ...data as any },
    });
  }
}
