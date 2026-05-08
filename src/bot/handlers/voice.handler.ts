import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { GeminiService, Intent } from '../services/gemini.service';
import { ReportService } from '../services/report.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import { ExchangeRatesService } from '../../modules/exchange-rates/exchange-rates.service';
import { BudgetsService } from '../../modules/budgets/budgets.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { formatTransaction, formatReport } from '../services/format.service';
import { t } from './command.handler';
import * as https from 'https';

@Injectable()
export class VoiceHandler {
  constructor(
    private readonly gemini: GeminiService,
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
    private readonly exchangeRates: ExchangeRatesService,
    private readonly budgets: BudgetsService,
    private readonly prisma: PrismaService,
    private readonly reportService: ReportService,
  ) {}

  register(bot: Bot<any>) {
    bot.on('message:voice', ctx => this.handleVoice(ctx));
  }

  private async handleVoice(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const userMsgId = ctx.message?.message_id ?? null;
    ctx.session.lastUserMsgId = userMsgId;
    this.pushTransient(ctx, userMsgId);

    const awaiting = ctx.session?.awaitingField;
    const isEditFlow = typeof awaiting === 'string' && awaiting.startsWith('edit_');
    if (!isEditFlow) {
      await this.lockPreviousTxButtons(ctx);
    }

    const processing = await ctx.reply(t(lang, 'processing'));
    const cleanupProcessing = async () => {
      await ctx.api.deleteMessage(ctx.chat.id, processing.message_id).catch(() => {});
    };

    try {
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      const audioBuffer = await this.downloadBuffer(fileUrl);

      const awaiting = ctx.session?.awaitingField;
      if (awaiting === 'edit_amount' || awaiting === 'edit_note' || awaiting === 'edit_category') {
        await this.handleEditVoice(ctx, audioBuffer, awaiting);
        await cleanupProcessing();
        return;
      }

      if (awaiting === 'category_new_input') {
        const text = await this.gemini.transcribeCategoryName(audioBuffer, 'audio/ogg');
        await this.confirmNewCategory(ctx, text);
        await cleanupProcessing();
        return;
      }

      if (awaiting === 'edit_category_new_input') {
        const text = await this.gemini.transcribeCategoryName(audioBuffer, 'audio/ogg');
        await this.confirmNewCategoryForEdit(ctx, text);
        await cleanupProcessing();
        return;
      }

      const intent = await this.gemini.processVoice(audioBuffer, 'audio/ogg');
      await this.processIntent(ctx, intent);
      await cleanupProcessing();
    } catch (err: any) {
      console.error('Voice handler error:', err);
      const status = err?.status;
      const msg = String(err?.message ?? '');
      const isOverloaded = status === 503 || status === 429 || status === 500 || status === 502 || status === 504
        || msg.includes('overloaded') || msg.includes('Service Unavailable') || msg.includes('quota');
      await ctx.reply(t(lang, isOverloaded ? 'ai_overloaded' : 'not_understood'));
      await cleanupProcessing();
    }
  }

  private async handleEditVoice(ctx: any, audioBuffer: Buffer, awaiting: string) {
    const lang = ctx.session?.lang ?? 'uz';
    const txId: number | null = ctx.session.editingTxId;
    if (!txId) return ctx.reply(t(lang, 'not_understood'));

    if (awaiting === 'edit_amount') {
      const intent = await this.gemini.processVoice(audioBuffer, 'audio/ogg');
      const amount = intent.amount;
      if (!amount || isNaN(amount)) {
        return ctx.reply(t(lang, 'ask_amount'));
      }
      await this.transactions.update(txId, 0, 'OWNER', { amount } as any);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.refreshEditedTransaction(ctx, txId);
    }

    if (awaiting === 'edit_note') {
      const text = await this.gemini.transcribeVoice(audioBuffer, 'audio/ogg');
      if (!text) return ctx.reply(t(lang, 'not_understood'));
      await this.transactions.update(txId, 0, 'OWNER', {
        noteUz: text, noteRu: text, noteEn: text,
      } as any);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.refreshEditedTransaction(ctx, txId);
    }

    if (awaiting === 'edit_category') {
      const intent = await this.gemini.processVoice(audioBuffer, 'audio/ogg');
      const wsId = ctx.session?.activeWorkspaceId;
      const tx = await this.transactions.findOne(txId);
      if (!tx || !wsId) return ctx.reply(t(lang, 'not_understood'));
      if (!intent.categoryHint) return ctx.reply(t(lang, 'ask_category'));

      const { exact, similar } = await this.categories.findBestMatch(
        intent.categoryHint, wsId, tx.type as any,
      );
      const matched = exact ?? similar;
      if (!matched) {
        const catName = intent.categoryHint;
        return ctx.reply(`❓ "${catName}" kategoriyasi topilmadi. Mavjud kategoriyadan tanlang.`);
      }
      await this.transactions.update(txId, 0, 'OWNER', { categoryId: matched.id } as any);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.refreshEditedTransaction(ctx, txId);
    }
  }

  async refreshEditedTransaction(ctx: any, txId: number) {
    const lang = ctx.session?.lang ?? 'uz';
    const chatId = ctx.chat?.id ?? ctx.from?.id;

    const toDelete = [
      ctx.session.lastTxMessageId,
      ctx.session.lastBotPromptId,
    ].filter(Boolean);

    await Promise.all(
      toDelete.map((msgId: number) =>
        ctx.api.deleteMessage(chatId, msgId).catch(() => {}),
      ),
    );

    const tx = await this.transactions.findOne(txId);
    if (!tx) return;

    const formatted = formatTransaction(lang, {
      type: tx.type,
      category: tx.category,
      amount: Number(tx.amount),
      currency: tx.currency,
      exchangeRate: tx.exchangeRate ? Number(tx.exchangeRate) : undefined,
      amountUzs: tx.amountUzs ? Number(tx.amountUzs) : undefined,
      date: tx.date,
    });

    const sentMsg = await ctx.reply(formatted, {
      reply_markup: new InlineKeyboard()
        .text(t(lang, 'btn_cancel'), `delete_tx:${tx.id}`)
        .text(t(lang, 'btn_edit'), `edit_tx:${tx.id}`),
    });

    ctx.session.lastTxMessageId = sentMsg.message_id;
    ctx.session.lastBotPromptId = null;
  }

  async processIntent(ctx: any, intent: Intent) {
    const lang = ctx.session?.lang ?? 'uz';

    if (!intent || !intent.type || intent.type === 'UNKNOWN') {
      return ctx.reply(t(lang, 'not_understood'));
    }

    if (intent.type === 'DELETE_LAST') {
      const userId = await this.getUserId(ctx);
      const wsId = ctx.session?.activeWorkspaceId;
      if (!userId || !wsId) return ctx.reply(t(lang, 'no_workspace'));

      const deleted = await this.transactions.deleteLast(wsId, userId);
      return ctx.reply(deleted ? t(lang, 'deleted_last') : t(lang, 'nothing_to_delete'));
    }

    if (intent.type === 'QUERY_REPORT') {
      const wsId = ctx.session?.activeWorkspaceId;
      if (!wsId) return ctx.reply(t(lang, 'no_workspace'));
      const data = await this.reportService.getReport(
        wsId,
        intent.reportType ?? 'balance',
        intent.period ?? 'month',
      );
      return ctx.reply(formatReport(lang, data));
    }

    if (intent.type === 'ADD_TRANSACTION') {
      return this.askMissingFields(ctx, intent);
    }

    return ctx.reply(t(lang, 'not_understood'));
  }

  async askMissingFields(ctx: any, intent: Intent) {
    const lang = ctx.session?.lang ?? 'uz';
    const missing = intent.missingFields ?? [];

    if (!ctx.session?.activeWorkspaceId) {
      return ctx.reply(t(lang, 'no_workspace'));
    }

    if (!intent.amount || missing.includes('amount')) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'amount';
      const m = await ctx.reply(t(lang, 'ask_amount'));
      this.pushTransient(ctx, m.message_id);
      return;
    }

    if (!intent.txType || missing.includes('txType')) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'txType';
      const m = await ctx.reply(t(lang, 'ask_txtype'), {
        reply_markup: new InlineKeyboard()
          .text(t(lang, 'btn_income'), 'txtype:INCOME')
          .text(t(lang, 'btn_expense'), 'txtype:EXPENSE'),
      });
      this.pushTransient(ctx, m.message_id);
      return;
    }

    await this.handleCategory(ctx, intent);
  }

  async handleCategory(ctx: any, intent: Intent) {
    const lang = ctx.session?.lang ?? 'uz';
    const wsId = ctx.session?.activeWorkspaceId;

    if (!intent.categoryHint) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'category';
      const cats = await this.categories.getForType(wsId, intent.txType!);
      const msg = await ctx.reply(t(lang, 'ask_category'), {
        reply_markup: this.buildCategoryKeyboard(cats, lang),
      });
      ctx.session.lastBotPromptId = msg.message_id;
      this.pushTransient(ctx, msg.message_id);
      return;
    }

    const { exact, similar } = await this.categories.findBestMatch(
      intent.categoryHint, wsId, intent.txType!,
    );

    if (exact) {
      (intent as any).resolvedCategoryId = exact.id;
      return this.savePendingTransaction(ctx, intent);
    }

    if (similar) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'category_confirm';
      const catName = lang === 'uz' ? similar.nameUz : lang === 'ru' ? similar.nameRu : similar.nameEn;
      const msg = await ctx.reply(
        `"${intent.categoryHint}" kategoriyasi yo'q.\n"${catName}" ga qo'shaylikmi?`,
        {
          reply_markup: new InlineKeyboard()
            .text('✅ Ha', `usecat:${similar.id}`).row()
            .text(`➕ "${intent.categoryHint}" yaratish`, `createcat:${intent.categoryHint}:${intent.txType}`).row()
            .text('📋 Mavjuddan tanlash', 'listcats').row()
            .text('🆕 Yangi nom bilan yaratish', 'newcat_input'),
        },
      );
      ctx.session.lastBotPromptId = msg.message_id;
      this.pushTransient(ctx, msg.message_id);
      return;
    }

    ctx.session.pendingTx = intent;
    ctx.session.awaitingField = 'category_new';
    const msg = await ctx.reply(
      `"${intent.categoryHint}" kategoriyasi topilmadi.\nYangi kategoriya sifatida yarataylikmi?`,
      {
        reply_markup: new InlineKeyboard()
          .text(`✅ Ha, "${intent.categoryHint}" yaratish`, `createcat:${intent.categoryHint}:${intent.txType}`).row()
          .text('📋 Mavjud kategoriyadan tanlash', 'listcats').row()
          .text('🆕 Yangi nom bilan yaratish', 'newcat_input').row()
          .text(t(lang, 'btn_cancel'), 'cancel'),
      },
    );
    ctx.session.lastBotPromptId = msg.message_id;
    this.pushTransient(ctx, msg.message_id);
  }

  async lockPreviousTxButtons(ctx: any) {
    const prevMsgId = ctx.session?.lastTxMessageId;
    if (!prevMsgId) return;
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    await ctx.api.editMessageReplyMarkup(chatId, prevMsgId, {
      reply_markup: { inline_keyboard: [] },
    }).catch(() => {});
    ctx.session.lastTxMessageId = null;
  }

  pushTransient(ctx: any, msgId: number | null | undefined) {
    if (!msgId) return;
    if (!Array.isArray(ctx.session.transientMsgIds)) ctx.session.transientMsgIds = [];
    ctx.session.transientMsgIds.push(msgId);
  }

  async cleanupTransients(ctx: any) {
    const ids: number[] = ctx.session?.transientMsgIds ?? [];
    if (ids.length === 0) return;
    const chatId = ctx.chat?.id ?? ctx.from?.id;
    await Promise.all(ids.map((id: number) =>
      ctx.api.deleteMessage(chatId, id).catch(() => {}),
    ));
    ctx.session.transientMsgIds = [];
  }

  async confirmNewCategory(ctx: any, hint: string) {
    const lang = ctx.session?.lang ?? 'uz';
    const cleanHint = hint.trim().replace(/[.!?,;:"'`]+$/g, '').replace(/^["'`]+/, '').trim();

    if (!cleanHint || cleanHint.length > 60) {
      const m = await ctx.reply('❓ Kategoriya nomi tushunarsiz. Qayta ovozli yoki matn shaklida ayting:');
      this.pushTransient(ctx, m.message_id);
      ctx.session.awaitingField = 'category_new_input';
      return;
    }

    ctx.session.pendingNewCatHint = cleanHint;
    ctx.session.awaitingField = null;

    const msg = await ctx.reply(`🆕 "${cleanHint}" nomli kategoriyani yaratamizmi?`, {
      reply_markup: new InlineKeyboard()
        .text('✅ Ha, yarat', 'confirm_newcat').row()
        .text('🔄 Qayta ayting/yozing', 'newcat_input').row()
        .text(t(lang, 'btn_cancel'), 'cancel'),
    });
    this.pushTransient(ctx, msg.message_id);
  }

  async confirmNewCategoryForEdit(ctx: any, hint: string) {
    const lang = ctx.session?.lang ?? 'uz';
    const cleanHint = hint.trim().replace(/[.!?,;:"'`]+$/g, '').replace(/^["'`]+/, '').trim();

    if (!cleanHint || cleanHint.length > 60) {
      const m = await ctx.reply('❓ Kategoriya nomi tushunarsiz. Qayta ovozli yoki matn shaklida ayting:');
      this.pushTransient(ctx, m.message_id);
      ctx.session.awaitingField = 'edit_category_new_input';
      return;
    }

    ctx.session.pendingNewCatHint = cleanHint;
    ctx.session.awaitingField = null;

    const msg = await ctx.reply(`🆕 "${cleanHint}" nomli kategoriyani yaratamizmi?`, {
      reply_markup: new InlineKeyboard()
        .text('✅ Ha, yarat', 'edit_confirm_newcat').row()
        .text('🔄 Qayta ayting/yozing', 'edit_newcat_input').row()
        .text(t(lang, 'btn_cancel'), 'cancel'),
    });
    this.pushTransient(ctx, msg.message_id);
  }

  async createConfirmedCategory(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const wsId = ctx.session?.activeWorkspaceId;
    const pending = ctx.session?.pendingTx;
    const hint = ctx.session?.pendingNewCatHint;
    if (!wsId || !pending || !hint) return ctx.reply(t(lang, 'no_workspace'));

    const txType = (pending.txType ?? 'EXPENSE') as 'INCOME' | 'EXPENSE';
    const newCat = await this.categories.createFromHint(hint, wsId, txType);
    pending.resolvedCategoryId = newCat.id;
    ctx.session.pendingNewCatHint = null;
    ctx.session.awaitingField = null;

    return this.savePendingTransaction(ctx, pending);
  }

  async savePendingTransaction(ctx: any, intent: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const wsId = ctx.session?.activeWorkspaceId;
    const userId = await this.getUserId(ctx);
    if (!userId || !wsId) return ctx.reply(t(lang, 'no_workspace'));

    const userSettings = await this.prisma.userSettings.findUnique({ where: { userId } });
    const currency = intent.currency ?? userSettings?.defaultCurrency ?? 'UZS';

    let amountUzs = intent.amount;
    let exchangeRate: number | undefined;

    if (currency === 'USD') {
      exchangeRate = await this.exchangeRates.getRate('USD', 'UZS');
      amountUzs = intent.amount * exchangeRate;
    }

    const tx = await this.transactions.create({
      workspaceId: wsId,
      amount: intent.amount,
      currency,
      amountUzs,
      exchangeRate,
      type: intent.txType!,
      categoryId: intent.resolvedCategoryId,
      note: intent.note,
      date: new Date(),
      source: 'TELEGRAM',
      userId,
    });

    ctx.session.pendingTx = null;
    ctx.session.awaitingField = null;
    ctx.session.lastTxId = tx.id;
    ctx.session.pendingNewCatHint = null;

    // Barcha oraliq xabarlar (menyu, prompt, user voice/text)ni o'chirish
    await this.cleanupTransients(ctx);
    if (ctx.session.lastBotPromptId) {
      await ctx.api.deleteMessage(ctx.chat.id, ctx.session.lastBotPromptId).catch(() => {});
      ctx.session.lastBotPromptId = null;
    }

    const formatted = formatTransaction(lang, {
      type: tx.type,
      category: tx.category,
      amount: Number(tx.amount),
      currency: tx.currency,
      exchangeRate: exchangeRate,
      amountUzs: amountUzs,
      date: tx.date,
    });

    const sentMsg = await ctx.reply(formatted, {
      reply_markup: new InlineKeyboard()
        .text(t(lang, 'btn_cancel'), `delete_tx:${tx.id}`)
        .text(t(lang, 'btn_edit'), `edit_tx:${tx.id}`),
    });

    ctx.session.lastTxId = tx.id;
    ctx.session.lastTxMessageId = sentMsg.message_id;

    await this.checkBudgetWarning(ctx, wsId, tx.categoryId, lang);
  }

  private async checkBudgetWarning(ctx: any, wsId: number, categoryId: number, lang: string) {
    const progress = await this.budgets.getBudgetProgress(wsId);
    const item = progress.find(p => p.budget.categoryId === categoryId);
    if (!item) return;

    const catName = lang === 'uz' ? item.budget.category.nameUz
      : lang === 'ru' ? item.budget.category.nameRu
      : item.budget.category.nameEn;

    if (item.status === 'exceeded') {
      await ctx.reply(t(lang, 'budget_exceeded', { category: catName }));
    } else if (item.status === 'warning') {
      await ctx.reply(t(lang, 'budget_warning', { category: catName, percent: item.percent }));
    }
  }

  private buildCategoryKeyboard(cats: any[], lang: string) {
    const kb = new InlineKeyboard();
    cats.forEach((c, i) => {
      const name = lang === 'uz' ? c.nameUz : lang === 'ru' ? c.nameRu : c.nameEn;
      kb.text(name, `usecat:${c.id}`);
      if ((i + 1) % 2 === 0) kb.row();
    });
    return kb;
  }

  private async getUserId(ctx: any): Promise<number | null> {
    const tgId = BigInt(ctx.from?.id ?? 0);
    if (!ctx.from?.id) return null;

    let user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId: tgId,
          firstName: ctx.from.first_name ?? 'User',
          lastName: ctx.from.last_name ?? null,
          username: ctx.from.username ?? null,
          settings: { create: {} },
        },
      });
    }

    return user.id;
  }

  private downloadBuffer(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      https.get(url, res => {
        const chunks: Buffer[] = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      }).on('error', reject);
    });
  }
}
