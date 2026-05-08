import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, session } from 'grammy';
import { CommandHandler } from './handlers/command.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { TextHandler } from './handlers/text.handler';
import { CallbackHandler } from './handlers/callback.handler';

export interface SessionData {
  lang: 'uz' | 'ru' | 'en';
  activeWorkspaceId: number | null;
  pendingTx: any | null;
  awaitingField: string | null;
  lastTxId: number | null;
}

@Injectable()
export class BotService implements OnModuleInit {
  public bot: Bot<any>;

  constructor(
    private readonly commandHandler: CommandHandler,
    private readonly voiceHandler: VoiceHandler,
    private readonly textHandler: TextHandler,
    private readonly callbackHandler: CallbackHandler,
  ) {
    this.bot = new Bot(process.env.BOT_TOKEN!);

    this.bot.use(session({
      initial: (): SessionData => ({
        lang: 'uz',
        activeWorkspaceId: null,
        pendingTx: null,
        awaitingField: null,
        lastTxId: null,
      }),
    }));

    this.commandHandler.register(this.bot);
    this.voiceHandler.register(this.bot);
    this.textHandler.register(this.bot);
    this.callbackHandler.register(this.bot);

    this.bot.catch(err => console.error('Bot error:', err));
  }

  async onModuleInit() {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      await this.bot.api.setWebhook(`${webhookUrl}/bot/webhook`);
      console.log(`Webhook set: ${webhookUrl}/bot/webhook`);
    } else {
      this.bot.start();
      console.log('Bot started in polling mode');
    }
  }

  async handleUpdate(update: any) {
    await this.bot.handleUpdate(update);
  }
}
