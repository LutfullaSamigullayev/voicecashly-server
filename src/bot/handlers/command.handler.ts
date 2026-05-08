import { Injectable } from '@nestjs/common';
import { Bot, InlineKeyboard } from 'grammy';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { WorkspacesService } from '../../modules/workspaces/workspaces.service';
import { ReportService } from '../services/report.service';
import { formatReport } from '../services/format.service';
import uz from '../locales/uz.json';
import ru from '../locales/ru.json';
import en from '../locales/en.json';

const locales: Record<string, any> = { uz, ru, en };
export const t = (lang: string, key: string, vars?: Record<string, string | number>) => {
  let str = locales[lang]?.[key] ?? locales['uz'][key] ?? key;
  if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{{${k}}}`, String(v)); });
  return str;
};

@Injectable()
export class CommandHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workspacesService: WorkspacesService,
    private readonly reportService: ReportService,
  ) {}

  register(bot: Bot<any>) {
    bot.command('start', ctx => this.handleStart(ctx));
    bot.command('help', ctx => this.handleHelp(ctx));
    bot.command('report', ctx => this.handleReport(ctx, 'balance', 'month'));
    bot.command('today', ctx => this.handleReport(ctx, 'balance', 'today'));
    bot.command('income', ctx => this.handleReport(ctx, 'income', 'month'));
    bot.command('expense', ctx => this.handleReport(ctx, 'expense', 'month'));
    bot.command('top', ctx => this.handleReport(ctx, 'top_expense', 'month'));
    bot.command('balance', ctx => this.handleReport(ctx, 'balance', 'month'));
    bot.command('switch', ctx => this.handleSwitch(ctx));
    bot.command('settings', ctx => this.handleSettings(ctx));
    bot.command('lang', ctx => this.handleLang(ctx));
    bot.command('invite', ctx => this.handleInvite(ctx));
  }

  private async handleStart(ctx: any) {
    const param = ctx.match;

    // Invite orqali kirish: /start join_XXXXXX
    if (typeof param === 'string' && param.startsWith('join_')) {
      const inviteCode = param.slice(5);
      const lang = ctx.session?.lang ?? 'uz';
      const userId = await this.getUserId(ctx);
      if (!userId) return ctx.reply(t(lang, 'error_generic'));

      try {
        const ws = await this.workspacesService.joinByInviteCode(userId, inviteCode);
        ctx.session.activeWorkspaceId = ws.id;
        return ctx.reply(t(lang, 'joined_workspace', { name: ws.name }));
      } catch {
        return ctx.reply(t(lang, 'invite_invalid'));
      }
    }

    return ctx.reply(
      "🌐 Tilni tanlang\n🇷🇺 Выберите язык\n🇬🇧 Choose language",
      {
        reply_markup: new InlineKeyboard()
          .text("🇺🇿 O'zbek", 'startlang:uz')
          .text('🇷🇺 Русский', 'startlang:ru')
          .text('🇬🇧 English', 'startlang:en'),
      },
    );
  }

  private async handleHelp(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    await ctx.reply(t(lang, 'help_text'));
  }

  private async handleReport(ctx: any, reportType: string, period: string) {
    const wsId = ctx.session?.activeWorkspaceId;
    if (!wsId) return ctx.reply(t(ctx.session?.lang ?? 'uz', 'no_workspace'));

    const lang = ctx.session?.lang ?? 'uz';
    const data = await this.reportService.getReport(wsId, reportType, period);
    await ctx.reply(formatReport(lang, data));
  }

  private async handleSwitch(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const userId = await this.getUserId(ctx);
    if (!userId) return;

    const workspaces = await this.workspacesService.getUserWorkspaces(userId);
    if (workspaces.length === 0) return ctx.reply(t(lang, 'no_workspace'));

    const kb = new InlineKeyboard();
    workspaces.forEach(m => {
      const name = m.workspace.isPersonal
        ? `👤 ${m.workspace.name}`
        : `🏢 ${m.workspace.name}`;
      kb.text(name, `switch:${m.workspaceId}`).row();
    });

    await ctx.reply(t(lang, 'switch_workspace'), { reply_markup: kb });
  }

  private async handleSettings(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    await ctx.reply(t(lang, 'settings_menu'), {
      reply_markup: new InlineKeyboard()
        .text(t(lang, 'choose_currency'), 'settings:currency').row()
        .text(t(lang, 'choose_lang'), 'settings:lang').row()
        .text(t(lang, 'settings_workspace_btn'), 'settings:workspace'),
    });
  }

  private async handleLang(ctx: any) {
    await ctx.reply('🌐', {
      reply_markup: new InlineKeyboard()
        .text("🇺🇿 O'zbek", 'lang:uz')
        .text('🇷🇺 Русский', 'lang:ru')
        .text('🇬🇧 English', 'lang:en'),
    });
  }

  private async handleInvite(ctx: any) {
    const lang = ctx.session?.lang ?? 'uz';
    const wsId = ctx.session?.activeWorkspaceId;
    const userId = await this.getUserId(ctx);
    if (!wsId || !userId) return ctx.reply(t(lang, 'no_workspace'));

    try {
      const code = await this.workspacesService.getInviteCode(wsId, userId);
      const botUsername = ctx.me?.username;
      const link = `https://t.me/${botUsername}?start=join_${code}`;
      await ctx.reply(t(lang, 'invite_link', { link }));
    } catch (e: any) {
      const msg = e?.message ?? '';
      if (msg.includes('personal')) return ctx.reply(t(lang, 'only_team_invite'));
      return ctx.reply(t(lang, 'only_owner_invite'));
    }
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
