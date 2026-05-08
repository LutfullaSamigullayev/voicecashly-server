import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WorkspacesService } from '../../modules/workspaces/workspaces.service';
import { CategoriesService } from '../../modules/categories/categories.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import { VoiceHandler } from './voice.handler';
import { formatTransaction } from '../services/format.service';
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

      const chatId = ctx.chat?.id ?? ctx.from?.id;
      const welcomeMsgId = ctx.callbackQuery?.message?.message_id;
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text('⏳ Yaratilmoqda...', 'noop'),
      }).catch(() => {});

      const ws = await this.workspacesService.createPersonalWorkspace(userId);
      ctx.session.activeWorkspaceId = ws.id;
      ctx.session.lang = lang;

      if (welcomeMsgId) {
        await ctx.api.deleteMessage(chatId, welcomeMsgId).catch(() => {});
      }
      return ctx.reply(`✅ ${ws.name} yaratildi!\n\nOvozli yoki matnli xabar yuboring.`);
    }

    if (data === 'start:team') {
      ctx.session.awaitingField = 'team_name';
      return ctx.reply('🏢 Jamoa nomini kiriting:');
    }

    if (data.startsWith('create_team:')) {
      const name = data.slice('create_team:'.length);
      const userId = await this.getUserId(ctx);
      if (!userId) return;

      const chatId = ctx.chat?.id ?? ctx.from?.id;
      const welcomeMsgId = ctx.callbackQuery?.message?.message_id;
      await ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard().text('⏳ Yaratilmoqda...', 'noop'),
      }).catch(() => {});

      const ws = await this.workspacesService.createTeamWorkspace(userId, name);
      ctx.session.activeWorkspaceId = ws.id;

      if (welcomeMsgId) {
        await ctx.api.deleteMessage(chatId, welcomeMsgId).catch(() => {});
      }
      return ctx.reply(`✅ "${ws.name}" workspacei yaratildi!\n\nOvozli yoki matnli xabar yuboring.`);
    }

    if (data === 'noop') return;

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
      kb.row().text('🆕 Yangi nom bilan yaratish', 'newcat_input');
      const msg = await ctx.reply(t(lang, 'ask_category'), { reply_markup: kb });
      ctx.session.lastBotPromptId = msg.message_id;
      this.voiceHandler.pushTransient(ctx, msg.message_id);
      return;
    }

    // Yangi kategoriya nomi (ovoz/matn bilan)
    if (data === 'newcat_input') {
      ctx.session.awaitingField = 'category_new_input';
      ctx.session.pendingNewCatHint = null;
      const msg = await ctx.reply('🆕 Yangi kategoriya nomini ovozli yoki matn shaklida yuboring:');
      ctx.session.lastBotPromptId = msg.message_id;
      this.voiceHandler.pushTransient(ctx, msg.message_id);
      return;
    }

    // Yangi kategoriyani tasdiqlash
    if (data === 'confirm_newcat') {
      return this.voiceHandler.createConfirmedCategory(ctx);
    }

    // Tranzaksiya o'chirish
    if (data.startsWith('delete_tx:')) {
      const txId = parseInt(data.split(':')[1]);
      const userId = await this.getUserId(ctx);
      if (!userId) return;

      await this.transactions.remove(txId, userId, 'OWNER');

      const chatId = ctx.chat?.id ?? ctx.from?.id;
      await this.voiceHandler.cleanupTransients(ctx);
      const userMsgId: number | null = ctx.session.lastUserMsgId;
      if (userMsgId) {
        await ctx.api.deleteMessage(chatId, userMsgId).catch(() => {});
        ctx.session.lastUserMsgId = null;
      }

      await ctx.editMessageText('🗑 Tranzaksiya o\'chirildi');
      const txMsgId = ctx.callbackQuery?.message?.message_id;

      setTimeout(() => {
        if (txMsgId) {
          ctx.api.deleteMessage(chatId, txMsgId).catch(() => {});
        }
      }, 2000);
      return;
    }

    // Tranzaksiya tahrirlash — menyu
    if (data.startsWith('edit_tx:')) {
      const txId = parseInt(data.split(':')[1]);
      const tx = await this.transactions.findOne(txId);
      if (!tx) return ctx.answerCallbackQuery('Tranzaksiya topilmadi');

      ctx.session.editingTxId = txId;

      const catName = lang === 'uz' ? tx.category.nameUz
        : lang === 'ru' ? tx.category.nameRu : tx.category.nameEn;
      const n = (v: number) => v.toLocaleString('uz-UZ');

      return ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard()
          .text(`💰 Miqdor: ${n(Number(tx.amount))}`, `edit_field:amount:${txId}`).row()
          .text(`🏷 Kategoriya: ${catName}`, `edit_field:category:${txId}`).row()
          .text(`📝 Izoh`, `edit_field:note:${txId}`).row()
          .text('❌ Yopish', 'close_edit'),
      });
    }

    // Tahrirlash — maydon tanlash
    if (data.startsWith('edit_field:')) {
      const [, field, txId] = data.split(':');
      ctx.session.editingTxId = parseInt(txId);
      ctx.session.awaitingField = `edit_${field}`;

      if (field === 'amount') {
        await ctx.answerCallbackQuery();
        const msg = await ctx.reply('💰 Yangi miqdorni kiriting:');
        ctx.session.lastBotPromptId = msg.message_id;
        return;
      }

      if (field === 'note') {
        await ctx.answerCallbackQuery();
        const msg = await ctx.reply('📝 Yangi izohni kiriting:');
        ctx.session.lastBotPromptId = msg.message_id;
        return;
      }

      if (field === 'category') {
        const tx = await this.transactions.findOne(parseInt(txId));
        if (!tx) return;
        const wsId = ctx.session?.activeWorkspaceId;
        const cats = await this.categories.getForType(wsId, tx.type as any);
        const kb = new InlineKeyboard();
        cats.forEach((c, i) => {
          const name = lang === 'uz' ? c.nameUz : lang === 'ru' ? c.nameRu : c.nameEn;
          kb.text(name, `edit_cat:${c.id}:${txId}`);
          if ((i + 1) % 2 === 0) kb.row();
        });
        kb.row().text('🆕 Yangi nom bilan yaratish', 'edit_newcat_input');
        await ctx.answerCallbackQuery();
        const msg = await ctx.reply('🏷 Yangi kategoriyani tanlang:', { reply_markup: kb });
        ctx.session.lastBotPromptId = msg.message_id;
        this.voiceHandler.pushTransient(ctx, msg.message_id);
        return;
      }
    }

    // Tahrirlash uchun yangi kategoriya nomi
    if (data === 'edit_newcat_input') {
      ctx.session.awaitingField = 'edit_category_new_input';
      ctx.session.pendingNewCatHint = null;
      await ctx.answerCallbackQuery();
      const msg = await ctx.reply('🆕 Yangi kategoriya nomini ovozli yoki matn shaklida yuboring:');
      ctx.session.lastBotPromptId = msg.message_id;
      this.voiceHandler.pushTransient(ctx, msg.message_id);
      return;
    }

    // Tahrirlash uchun yangi kategoriyani tasdiqlash
    if (data === 'edit_confirm_newcat') {
      const txId = ctx.session.editingTxId;
      const hint = ctx.session.pendingNewCatHint;
      const wsId = ctx.session.activeWorkspaceId;
      if (!txId || !hint || !wsId) return ctx.reply('❌ Xatolik');

      const tx = await this.transactions.findOne(txId);
      if (!tx) return;

      const newCat = await this.categories.createFromHint(hint, wsId, tx.type as any);
      await this.transactions.update(txId, await this.getUserId(ctx) ?? 0, 'OWNER', {
        categoryId: newCat.id,
      } as any);

      ctx.session.pendingNewCatHint = null;
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      await this.voiceHandler.cleanupTransients(ctx);
      await this.cleanupAndShowUpdated(ctx, txId, null);
      return;
    }

    // Tahrirlash — kategoriya saqlash
    if (data.startsWith('edit_cat:')) {
      const [, catId, txId] = data.split(':');
      await this.transactions.update(parseInt(txId), await this.getUserId(ctx) ?? 0, 'OWNER', {
        categoryId: parseInt(catId),
      });
      await this.cleanupAndShowUpdated(ctx, parseInt(txId), null);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return;
    }

    if (data === 'close_edit') {
      const txId = ctx.session.editingTxId;
      ctx.session.editingTxId = null;
      ctx.session.awaitingField = null;
      if (!txId) {
        return ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
      }
      return ctx.editMessageReplyMarkup({
        reply_markup: new InlineKeyboard()
          .text(t(lang, 'btn_cancel'), `delete_tx:${txId}`)
          .text(t(lang, 'btn_edit'), `edit_tx:${txId}`)
          .row()
          .text('✅ Tasdiqlash', `confirm_tx:${txId}`),
      });
    }

    // Tranzaksiyani tasdiqlash (tugmalarni qulflash)
    if (data.startsWith('confirm_tx:')) {
      ctx.session.lastTxMessageId = null;
      return ctx.editMessageReplyMarkup({ reply_markup: new InlineKeyboard() });
    }

    // Bekor qilish
    if (data === 'cancel') {
      ctx.session.pendingTx = null;
      ctx.session.awaitingField = null;
      ctx.session.pendingNewCatHint = null;
      await this.voiceHandler.cleanupTransients(ctx);
      ctx.session.lastBotPromptId = null;
      const m = await ctx.reply(t(lang, 'btn_cancel'));
      setTimeout(() => {
        ctx.api.deleteMessage(ctx.chat?.id ?? ctx.from?.id, m.message_id).catch(() => {});
      }, 1500);
      return;
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

  async cleanupAndShowUpdated(ctx: any, txId: number, userMessageId: number | null) {
    const lang = ctx.session?.lang ?? 'uz';
    const chatId = ctx.chat?.id ?? ctx.from?.id;

    // Eski xabarlarni o'chirish
    const toDelete = [
      ctx.session.lastTxMessageId,
      ctx.session.lastBotPromptId,
      userMessageId,
    ].filter(Boolean);

    await Promise.all(
      toDelete.map(msgId =>
        ctx.api.deleteMessage(chatId, msgId).catch(() => {}),
      ),
    );

    // Yangilangan tranzaksiyani olish
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
}
