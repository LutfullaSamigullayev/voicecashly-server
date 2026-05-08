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
    await this.registerCommandsMenu();

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

  private async registerCommandsMenu() {
    const commandsByLang = {
      uz: [
        { command: 'start',    description: 'Botni ishga tushirish' },
        { command: 'report',   description: 'Oylik hisobot' },
        { command: 'today',    description: 'Bugungi balans' },
        { command: 'balance',  description: 'Joriy balans' },
        { command: 'income',   description: 'Kirimlar' },
        { command: 'expense',  description: 'Chiqimlar' },
        { command: 'top',      description: 'Top kategoriyalar' },
        { command: 'switch',   description: 'Workspace almashtirish' },
        { command: 'settings', description: 'Sozlamalar' },
        { command: 'lang',     description: 'Tilni o\'zgartirish' },
        { command: 'invite',   description: 'Jamoaga taklif qilish' },
        { command: 'help',     description: 'Yordam' },
      ],
      ru: [
        { command: 'start',    description: 'Запустить бот' },
        { command: 'report',   description: 'Отчёт за месяц' },
        { command: 'today',    description: 'Баланс сегодня' },
        { command: 'balance',  description: 'Текущий баланс' },
        { command: 'income',   description: 'Доходы' },
        { command: 'expense',  description: 'Расходы' },
        { command: 'top',      description: 'Топ категорий' },
        { command: 'switch',   description: 'Сменить workspace' },
        { command: 'settings', description: 'Настройки' },
        { command: 'lang',     description: 'Изменить язык' },
        { command: 'invite',   description: 'Пригласить в команду' },
        { command: 'help',     description: 'Справка' },
      ],
      en: [
        { command: 'start',    description: 'Start the bot' },
        { command: 'report',   description: 'Monthly report' },
        { command: 'today',    description: "Today's balance" },
        { command: 'balance',  description: 'Current balance' },
        { command: 'income',   description: 'Income' },
        { command: 'expense',  description: 'Expenses' },
        { command: 'top',      description: 'Top categories' },
        { command: 'switch',   description: 'Switch workspace' },
        { command: 'settings', description: 'Settings' },
        { command: 'lang',     description: 'Change language' },
        { command: 'invite',   description: 'Invite to team' },
        { command: 'help',     description: 'Help' },
      ],
    };

    // Default (Telegram tilini boshqa qiymatda ushlab qolgan foydalanuvchilar uchun) — uz
    await this.bot.api.setMyCommands(commandsByLang.uz);
    // Telegram interfeys tili bo'yicha mos menyu
    await this.bot.api.setMyCommands(commandsByLang.uz, { language_code: 'uz' });
    await this.bot.api.setMyCommands(commandsByLang.ru, { language_code: 'ru' });
    await this.bot.api.setMyCommands(commandsByLang.en, { language_code: 'en' });
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
