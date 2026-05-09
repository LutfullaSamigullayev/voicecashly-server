import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../shared/prisma/prisma.service';

const TOKEN_TTL_MS = 5 * 60 * 1000;

@Injectable()
export class BotAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async start(): Promise<{ token: string; deepLink: string; expiresAt: Date }> {
    // We use 16 bytes (32 hex chars) to ensure callback_data stays under Telegram's 64 byte limit
    const token = randomBytes(16).toString('hex');
    const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

    await this.prisma.loginToken.create({
      data: { token, status: 'PENDING', expiresAt },
    });

    const botUsername = process.env.BOT_USERNAME ?? 'VoiceCashlyBot';
    const deepLink = `https://t.me/${botUsername}?start=login_${token}`;
    return { token, deepLink, expiresAt };
  }

  async confirm(token: string, userId: number): Promise<void> {
    const row = await this.prisma.loginToken.findUnique({ where: { token } });
    if (!row) throw new BadRequestException('Token not found');
    if (row.expiresAt < new Date()) throw new BadRequestException('Token expired');
    if (row.status === 'CONFIRMED') return;

    await this.prisma.loginToken.update({
      where: { token },
      data: { userId, status: 'CONFIRMED' },
    });
  }

  async check(token: string): Promise<{ status: 'pending' | 'confirmed' | 'expired'; jwt?: string; user?: any }> {
    const row = await this.prisma.loginToken.findUnique({ where: { token } });
    if (!row) return { status: 'expired' };
    if (row.expiresAt < new Date()) {
      await this.prisma.loginToken.delete({ where: { token } }).catch(() => {});
      return { status: 'expired' };
    }
    if (row.status !== 'CONFIRMED' || !row.userId) return { status: 'pending' };

    const user = await this.prisma.user.findUnique({
      where: { id: row.userId },
      include: { settings: true, workspaces: { include: { workspace: true } } },
    });
    if (!user) return { status: 'expired' };

    const jwt = this.jwt.sign({ sub: user.id, tid: user.telegramId.toString() });

    await this.prisma.loginToken.delete({ where: { token } }).catch(() => {});

    return { status: 'confirmed', jwt, user };
  }
}
