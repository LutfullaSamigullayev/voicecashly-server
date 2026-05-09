import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class KeepAliveService {
  private readonly logger = new Logger(KeepAliveService.name);

  // Har 14 daqiqada ishlaydi (Render 15 daqiqada o'chadi)
  @Cron('*/14 * * * *')
  async handleCron() {
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
      this.logger.error('Failed to ping backend', error);
    }
  }
}
