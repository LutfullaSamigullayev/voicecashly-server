import { Injectable, OnModuleInit } from '@nestjs/common';
import { Bot, session } from 'grammy';
import { run, RunnerHandle, sequentialize } from '@grammyjs/runner';
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
  lastTxMessageId: number | null;
  lastBotPromptId: number | null;
  lastUserMsgId: number | null;
  editingTxId: number | null;
  pendingTeamName: string | null;
  transientMsgIds: number[];
  pendingNewCatHint: string | null;
}

@Injectable()
export class BotService implements OnModuleInit {
  public bot: Bot<any>;
  private runnerHandle: RunnerHandle | null = null;

  constructor(
    private readonly commandHandler: CommandHandler,
    private readonly voiceHandler: VoiceHandler,
    private readonly textHandler: TextHandler,
    private readonly callbackHandler: CallbackHandler,
  ) {
    this.bot = new Bot(process.env.BOT_TOKEN!);

    this.bot.use(sequentialize((ctx) => {
      const chat = ctx.chat?.id?.toString();
      const user = ctx.from?.id?.toString();
      return [chat, user].filter(Boolean) as string[];
    }));

    this.bot.use(session({
      initial: (): SessionData => ({
        lang: 'uz',
        activeWorkspaceId: null,
        pendingTx: null,
        awaitingField: null,
        lastTxId: null,
        lastTxMessageId: null,
        lastBotPromptId: null,
        lastUserMsgId: null,
        editingTxId: null,
        pendingTeamName: null,
        transientMsgIds: [],
        pendingNewCatHint: null,
      }),
    }));

    this.commandHandler.register(this.bot);
    this.voiceHandler.register(this.bot);
    this.textHandler.register(this.bot);
    this.callbackHandler.register(this.bot);

    this.bot.catch(err => {
      const desc = (err as any)?.error?.description ?? (err as any)?.description ?? '';
      // Telegram'ning "message is not modified" xatosi xavfsiz — jim qilamiz
      if (typeof desc === 'string' && desc.includes('message is not modified')) return;
      console.error('Bot error:', err);
    });
  }

  async onModuleInit() {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (webhookUrl) {
      await this.bot.api.setWebhook(`${webhookUrl}/bot/webhook`);
      console.log(`Webhook set: ${webhookUrl}/bot/webhook`);
    } else {
      await this.bot.api.deleteWebhook({ drop_pending_updates: true });
      this.runnerHandle = run(this.bot, {
        runner: { fetch: { allowed_updates: ['message', 'callback_query'] } },
      });
      console.log('Bot started in polling mode (concurrent runner, pending updates dropped)');
    }
  }

  async onModuleDestroy() {
    if (this.runnerHandle?.isRunning()) {
      await this.runnerHandle.stop();
    }
  }

  async handleUpdate(update: any) {
    await this.bot.handleUpdate(update);
  }
}
