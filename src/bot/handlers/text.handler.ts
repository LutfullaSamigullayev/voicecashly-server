import { Injectable } from '@nestjs/common';
import { Bot } from 'grammy';
import { GeminiService } from '../services/gemini.service';
import { VoiceHandler } from './voice.handler';
import { ReportService } from '../services/report.service';
import { formatReport } from '../services/format.service';
import { t } from './command.handler';

@Injectable()
export class TextHandler {
  constructor(
    private readonly gemini: GeminiService,
    private readonly voiceHandler: VoiceHandler,
    private readonly reportService: ReportService,
  ) {}

  register(bot: Bot<any>) {
    bot.on('message:text', ctx => this.handleText(ctx));
  }

  private async handleText(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const text = ctx.message.text;
    if (text.startsWith('/')) return;

    const wsId = ctx.session?.activeWorkspaceId;

    if (ctx.session?.awaitingField === 'amount') {
      const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (isNaN(amount)) return ctx.reply(t(lang, 'ask_amount'));
      ctx.session.pendingTx.amount = amount;
      ctx.session.awaitingField = null;
      return this.voiceHandler.askMissingFields(ctx, ctx.session.pendingTx);
    }

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
  }
}
