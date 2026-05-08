import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';
import { GeminiService } from '../services/gemini.service';
import { VoiceHandler } from './voice.handler';
import { ReportService } from '../services/report.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
import { WorkspacesService } from '../../modules/workspaces/workspaces.service';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { CallbackHandler } from './callback.handler';
import { formatReport } from '../services/format.service';
import { t } from './command.handler';

@Injectable()
export class TextHandler {
  constructor(
    private readonly gemini: GeminiService,
    private readonly voiceHandler: VoiceHandler,
    private readonly reportService: ReportService,
    private readonly transactions: TransactionsService,
    private readonly workspacesService: WorkspacesService,
    private readonly prisma: PrismaService,
    private readonly callbackHandler: CallbackHandler,
  ) {}

  register(bot: Bot<any>) {
    bot.on('message:text', ctx => this.handleText(ctx));
  }

  private async getDbUserId(ctx: any): Promise<number | null> {
    const tgId = BigInt(ctx.from?.id ?? 0);
    if (!ctx.from?.id) return null;
    const user = await this.prisma.user.findUnique({ where: { telegramId: tgId } });
    return user?.id ?? null;
  }

  private async handleText(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const text = ctx.message.text;
    const userMsgId: number = ctx.message.message_id;
    if (text.startsWith('/')) return;

    const wsId = ctx.session?.activeWorkspaceId;
    const awaiting = ctx.session?.awaitingField;

    // Miqdor so'rash (yangi tranzaksiya)
    if (awaiting === 'amount') {
      const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(amount)) return ctx.reply(t(lang, 'ask_amount'));
      this.voiceHandler.pushTransient(ctx, userMsgId);
      ctx.session.pendingTx.amount = amount;
      ctx.session.awaitingField = null;
      return this.voiceHandler.askMissingFields(ctx, ctx.session.pendingTx);
    }

    // Tahrirlash — miqdor
    if (awaiting === 'edit_amount') {
      const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(amount)) return ctx.reply(t(lang, 'invalid_amount'));
      const txId = ctx.session.editingTxId;
      await this.transactions.update(txId, 0, 'OWNER', { amount } as any);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.callbackHandler.cleanupAndShowUpdated(ctx, txId, userMsgId);
    }

    // Yangi kategoriya nomi (matn bilan)
    if (awaiting === 'category_new_input') {
      this.voiceHandler.pushTransient(ctx, userMsgId);
      await this.voiceHandler.confirmNewCategory(ctx, text);
      return;
    }

    // Tahrirlash uchun yangi kategoriya nomi (matn bilan)
    if (awaiting === 'edit_category_new_input') {
      this.voiceHandler.pushTransient(ctx, userMsgId);
      await this.voiceHandler.confirmNewCategoryForEdit(ctx, text);
      return;
    }

    // Tahrirlash — izoh
    if (awaiting === 'edit_note') {
      const txId = ctx.session.editingTxId;
      const noteUpdate: any = {};
      if (lang === 'uz') noteUpdate.noteUz = text;
      else if (lang === 'ru') noteUpdate.noteRu = text;
      else noteUpdate.noteEn = text;
      await this.transactions.update(txId, 0, 'OWNER', noteUpdate);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.callbackHandler.cleanupAndShowUpdated(ctx, txId, userMsgId);
    }

    // Workspace nomini o'zgartirish
    if (awaiting === 'rename_workspace') {
      const wsId = ctx.session?.activeWorkspaceId;
      const userId = await this.getDbUserId(ctx);
      if (!wsId || !userId) return ctx.reply(t(lang, 'error_generic'));

      ctx.session.awaitingField = null;
      this.voiceHandler.pushTransient(ctx, userMsgId);

      try {
        await this.workspacesService.renameWorkspace(wsId, userId, text.trim());
        return ctx.reply(t(lang, 'ws_renamed', { name: text.trim() }));
      } catch {
        return ctx.reply(t(lang, 'error_generic'));
      }
    }

    // Jamoa nomi (start:team oqimi)
    if (awaiting === 'team_name') {
      ctx.session.awaitingField = null;
      return ctx.reply(t(lang, 'team_create_confirm', { name: text }), {
        reply_markup: {
          inline_keyboard: [
            [{ text: t(lang, 'btn_yes'), callback_data: `create_team:${text}` }],
            [{ text: t(lang, 'btn_cancel'), callback_data: 'cancel' }],
          ],
        },
      });
    }

    // Hisobot so'rovi yoki tranzaksiya
    try {
      ctx.session.lastUserMsgId = userMsgId;
      this.voiceHandler.pushTransient(ctx, userMsgId);
      await this.voiceHandler.lockPreviousTxButtons(ctx);
      const intent = await this.gemini.processText(text);

      if (intent.type === 'QUERY_REPORT' && wsId) {
        const data = await this.reportService.getReport(
          wsId,
          intent.reportType ?? 'balance',
          intent.period ?? 'month',
        );
        return ctx.reply(formatReport(lang, data));
      }

      await this.voiceHandler.processIntent(ctx, intent);
    } catch (err: any) {
      console.error('Text handler error:', err);
      const status = err?.status;
      const msg = String(err?.message ?? '');
      const isOverloaded = status === 503 || status === 429 || status === 500 || status === 502 || status === 504
        || msg.includes('overloaded') || msg.includes('Service Unavailable') || msg.includes('quota');
      await ctx.reply(t(lang, isOverloaded ? 'ai_overloaded' : 'not_understood'));
    }
  }
}
