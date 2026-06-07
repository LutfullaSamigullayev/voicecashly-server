import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  constructor(private readonly prisma: PrismaService) {}

  // Har 14 daqiqada ishlaydi:
  //   1) Render'ni uyg'oq tutadi (15 daqiqada o'chadi)
  //   2) Supabase DB'ni faol tutadi (7 kun harakatsizlikdan keyin pauza qiladi)
  @Cron('*/14 * * * *')
  async handleCron() {
    await Promise.allSettled([this.pingSelf(), this.pingDatabase()]);
  }

  // Render free tier'ni uyg'oq tutish uchun o'ziga HTTP so'rov.
  private async pingSelf() {
    const url = process.env.RENDER_EXTERNAL_URL || 'https://voicecashly-server.onrender.com';
    try {
      this.logger.log(`Keeping backend alive by pinging: ${url}`);
      const res = await fetch(url);
      if (res.ok) {
        this.logger.log('Ping successful');
      } else {
        this.logger.warn(`Ping responded with status: ${res.status}`);
      }
    } catch (error) {
      this.logger.error('Failed to ping backend', error as Error);
    }
  }

  // Supabase free tier loyihani 7 kun DB faoliyatsizligidan keyin avtomatik pauza
  // qiladi (pooler "Tenant or user not found" qaytaradi, ilova ishga tushmay qoladi).
  // Render self-ping faqat /health'ni uradi va DB'ga tegmaydi — shuning uchun bu
  // yerda kichik so'rov bilan DB'ni ham "faol" tutamiz va pauzani oldini olamiz.
  private async pingDatabase() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      this.logger.log('Database ping successful');
    } catch (error) {
      this.logger.error('Failed to ping database', error as Error);
    }
  }
}
