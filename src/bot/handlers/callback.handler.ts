import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WorkspacesService } from '../../modules/workspaces/workspaces.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import { VoiceHandler } from './voice.handler';
import { t } from './command.handler';

@Injectable()
export class CallbackHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly categories: CategoriesService,
    private readonly transactions: TransactionsService,
    private readonly voiceHandler: VoiceHandler,
  ) {}

  register(bot: Bot<any>) {
    bot.on('callback_query:data', ctx => this.handleCallback(ctx));
  }

  private async handleCallback(ctx: any) {
    const data = ctx.callbackQuery.data;
    const lang = ctx.session?.lang ?? 'uz';

    await ctx.answerCallbackQuery().catch(() => {});

    // /start workspace seçimi
    if (data === 'start:personal') {
      const userId = await this.getUserId(ctx);
      if (!userId) return;
      const ws = await this.workspacesService.createPersonalWorkspace(userId);
      ctx.session.activeWorkspaceId = ws.id;
      ctx.session.lang = lang;
      return ctx.reply(`✅ ${ws.name} yaratildi!\n\nOvozli yoki matnli xabar yuboring.`);
    }

    if (data === 'start:team') {
      ctx.session.awaitingField = 'team_name';
      return ctx.reply('🏢 Jamoa nomini kiriting:');
    }

    // Workspace almashtirish
    if (data.startsWith('switch:')) {
      const wsId = parseInt(data.split(':')[1]);
      ctx.session.activeWorkspaceId = wsId;
      const ws = await this.prisma.workspace.findUnique({ where: { id: wsId } });
      return ctx.reply(`✅ ${ws?.name} tanlandi`);
    }

    // Txtype tanlash
    if (data.startsWith('txtype:')) {
      const txType = data.split(':')[1] as 'INCOME' | 'EXPENSE';
      if (ctx.session.pendingTx) {
        ctx.session.pendingTx.txType = txType;
        ctx.session.awaitingField = null;
        return this.voiceHandler.handleCategory(ctx, ctx.session.pendingTx);
      }
    }

    // Kategoriya tanlash
    if (data.startsWith('usecat:')) {
      const catId = parseInt(data.split(':')[1]);
      if (ctx.session.pendingTx) {
        ctx.session.pendingTx.resolvedCategoryId = catId;
        ctx.session.awaitingField = null;
        return this.voiceHandler.savePendingTransaction(ctx, ctx.session.pendingTx);
      }
    }

    // Yangi kategoriya yaratish
    if (data.startsWith('createcat:')) {
      const parts = data.split(':');
      const hint = parts[1];
      const txType = parts[2] as 'INCOME' | 'EXPENSE';
      const wsId = ctx.session?.activeWorkspaceId;

      const newCat = await this.categories.createFromHint(hint, wsId, txType);
      const catName = lang === 'uz' ? newCat.nameUz : lang === 'ru' ? newCat.nameRu : newCat.nameEn;

      await ctx.answerCallbackQuery(t(lang, 'cat_created', { name: catName }));

      if (ctx.session.pendingTx) {
        ctx.session.pendingTx.resolvedCategoryId = newCat.id;
        ctx.session.awaitingField = null;
        return this.voiceHandler.savePendingTransaction(ctx, ctx.session.pendingTx);
      }
    }

    // Kategoriya ro'yxati
    if (data === 'listcats') {
      const wsId = ctx.session?.activeWorkspaceId;
      const txType = ctx.session?.pendingTx?.txType;
      const cats = await this.categories.getForType(wsId, txType ?? 'EXPENSE');
      const kb = new InlineKeyboard();
      cats.forEach((c, i) => {
        const name = lang === 'uz' ? c.nameUz : lang === 'ru' ? c.nameRu : c.nameEn;
        kb.text(name, `usecat:${c.id}`);
        if ((i + 1) % 2 === 0) kb.row();
      });
      return ctx.reply(t(lang, 'ask_category'), { reply_markup: kb });
    }

    // Tranzaksiya o'chirish
    if (data.startsWith('delete_tx:')) {
      const txId = parseInt(data.split(':')[1]);
      const userId = await this.getUserId(ctx);
      if (userId) {
        await this.transactions.remove(txId, userId, 'OWNER');
        return ctx.editMessageText('🗑 Tranzaksiya o\'chirildi');
      }
    }

    // Bekor qilish
    if (data === 'cancel') {
      ctx.session.pendingTx = null;
      ctx.session.awaitingField = null;
      return ctx.reply(t(lang, 'btn_cancel'));
    }

    // Til tanlash
    if (data.startsWith('lang:')) {
      const newLang = data.split(':')[1];
      ctx.session.lang = newLang;
      const userId = await this.getUserId(ctx);
      if (userId) {
        await this.prisma.userSettings.upsert({
          where: { userId },
          update: { language: newLang.toUpperCase() as any },
          create: { userId, language: newLang.toUpperCase() as any },
        });
      }
      return ctx.reply(t(newLang, 'lang_changed'));
    }

    // Valyuta tanlash
    if (data.startsWith('currency:')) {
      const currency = data.split(':')[1];
      const userId = await this.getUserId(ctx);
      if (userId) {
        await this.prisma.userSettings.upsert({
          where: { userId },
          update: { defaultCurrency: currency as any },
          create: { userId, defaultCurrency: currency as any },
        });
      }
      return ctx.reply(t(lang, 'currency_set', { currency }));
    }

    // Settings menu
    if (data === 'settings:currency') {
      return ctx.reply(t(lang, 'choose_currency'), {
        reply_markup: new InlineKeyboard()
          .text(t(lang, 'btn_uzs'), 'currency:UZS')
          .text(t(lang, 'btn_usd'), 'currency:USD'),
      });
    }

    if (data === 'settings:lang') {
      return ctx.reply(t(lang, 'choose_lang'), {
        reply_markup: new InlineKeyboard()
          .text("🇺🇿 O'zbek", 'lang:uz')
          .text('🇷🇺 Русский', 'lang:ru')
          .text('🇬🇧 English', 'lang:en'),
      });
    }
  }

  private async getUserId(ctx: any): Promise<number | null> {
    const tgId = BigInt(ctx.from?.id ?? 0);
    const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
    return user?.id ?? null;
  }
}
