import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';
import { GeminiService } from '../services/gemini.service';
import { VoiceHandler } from './voice.handler';
import { ReportService } from '../services/report.service';
import { TransactionsService } from '../../modules/transactions/transactions.service';
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
    private readonly callbackHandler: CallbackHandler,
  ) {}

  register(bot: Bot<any>) {
    bot.on('message:text', ctx => this.handleText(ctx));
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
      if (isNaN(amount)) return ctx.reply('❌ Noto\'g\'ri miqdor. Raqam kiriting:');
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
      await this.transactions.update(txId, 0, 'OWNER', {
        noteUz: text, noteRu: text, noteEn: text,
      } as any);
      ctx.session.awaitingField = null;
      ctx.session.editingTxId = null;
      return this.callbackHandler.cleanupAndShowUpdated(ctx, txId, userMsgId);
    }

    // Jamoa nomi (start:team oqimi)
    if (awaiting === 'team_name') {
      ctx.session.awaitingField = null;
      return ctx.reply(`🏢 "${text}" nomli jamoa workspacemi?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '✅ Ha', callback_data: `create_team:${text}` }],
            [{ text: '❌ Bekor', callback_data: 'cancel' }],
          ],
        },
      });
    }

    // Hisobot so'rovi yoki tranzaksiya
    try {
      ctx.session.lastUserMsgId = userMsgId;
      this.voiceHandler.pushTransient(ctx, userMsgId);
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
