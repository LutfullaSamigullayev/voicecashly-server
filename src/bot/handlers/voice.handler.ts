import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { GeminiService, Intent } from '../services/gemini.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import { ExchangeRatesService } from '../../modules/exchange-rates/exchange-rates.service';
import { BudgetsService } from '../../modules/budgets/budgets.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { formatTransaction } from '../services/format.service';
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
  ) {}

  register(bot: Bot<any>) {
    bot.on('message:voice', ctx => this.handleVoice(ctx));
  }

  private async handleVoice(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const processing = await ctx.reply(t(lang, 'processing'));

    try {
      const file = await ctx.getFile();
      const fileUrl = `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`;
      const audioBuffer = await this.downloadBuffer(fileUrl);
      const intent = await this.gemini.processVoice(audioBuffer, 'audio/ogg');

      await ctx.api.deleteMessage(ctx.chat.id, processing.message_id).catch(() => {});
      await this.processIntent(ctx, intent);
    } catch (err) {
      await ctx.api.deleteMessage(ctx.chat.id, processing.message_id).catch(() => {});
      console.error('Voice handler error:', err);
      await ctx.reply(t(lang, 'not_understood'));
    }
  }

  async processIntent(ctx: any, intent: Intent) {
    const lang = ctx.session?.lang ?? 'uz';

    if (intent.type === 'UNKNOWN') {
      return ctx.reply(t(lang, 'not_understood'));
    }

    if (intent.type === 'DELETE_LAST') {
      const userId = await this.getUserId(ctx);
      const wsId = ctx.session?.activeWorkspaceId;
      if (!userId || !wsId) return ctx.reply(t(lang, 'no_workspace'));

      const deleted = await this.transactions.deleteLast(wsId, userId);
      return ctx.reply(deleted ? t(lang, 'deleted_last') : t(lang, 'nothing_to_delete'));
    }

    if (intent.type === 'ADD_TRANSACTION') {
      return this.askMissingFields(ctx, intent);
    }
  }

  async askMissingFields(ctx: any, intent: Intent) {
    const lang = ctx.session?.lang ?? 'uz';

    if (!ctx.session?.activeWorkspaceId) {
      return ctx.reply(t(lang, 'no_workspace'));
    }

    if (!intent.amount || intent.missingFields.includes('amount')) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'amount';
      return ctx.reply(t(lang, 'ask_amount'));
    }

    if (!intent.txType || intent.missingFields.includes('txType')) {
      ctx.session.pendingTx = intent;
      ctx.session.awaitingField = 'txType';
      return ctx.reply(t(lang, 'ask_txtype'), {
        reply_markup: new InlineKeyboard()
          .text(t(lang, 'btn_income'), 'txtype:INCOME')
          .text(t(lang, 'btn_expense'), 'txtype:EXPENSE'),
      });
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
            .text('📋 Mavjuddan tanlash', 'listcats'),
        },
      );
      ctx.session.lastBotPromptId = msg.message_id;
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
          .text(t(lang, 'btn_cancel'), 'cancel'),
      },
    );
    ctx.session.lastBotPromptId = msg.message_id;
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

    // Kategoriya prompt xabarini o'chirish
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
