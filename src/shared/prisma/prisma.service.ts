import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Database connected');
    } catch (err) {
      // DB vaqtincha mavjud bo'lmasa (masalan, Supabase free-tier pauza qilingan),
      // ilovani butunlay yiqitmaymiz. Aks holda Render qayta-qayta restart bo'lib
      // crash-loop'ga tushadi va bot/health ham ishlamaydi.
      // Prisma keyingi so'rovda avtomatik qayta ulanishga uradi (lazy connect),
      // shu sababli DB qaytib kelganda ilova o'zi tiklanadi.
      this.logger.error(
        `Database ulanmadi — ilova baribir ishga tushadi, so'rovlarda qayta urinadi: ${
          (err as Error)?.message ?? err
        }`,
      );
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
