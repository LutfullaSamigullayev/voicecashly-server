import { Controller, Post, Body } from '@nestjs/common';
import { BotService } from './bot.service';

@Controller('bot')
export class BotController {
  constructor(private readonly botService: BotService) {}

  @Post('webhook')
  async handleWebhook(@Body() update: any) {
    await this.botService.handleUpdate(update);
    return { ok: true };
  }
}
