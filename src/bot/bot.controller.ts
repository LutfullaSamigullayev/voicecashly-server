import { Controller, Post, Body } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: any) {
    try {
      await this.botService.handleUpdate(update);
    } catch (err) {
      console.error('Webhook handler error:', err);
    }
    return { ok: true };
  }
}
