import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { BotController } from './bot.controller';
import { CommandHandler } from './handlers/command.handler';
import { VoiceHandler } from './handlers/voice.handler';
import { TextHandler } from './handlers/text.handler';
import { CallbackHandler } from './handlers/callback.handler';
import { GeminiService } from './services/gemini.service';
import { ReportService } from './services/report.service';
import { CategoriesModule } from '../modules/categories/categories.module';
import { TransactionsModule } from '../modules/transactions/transactions.module';
import { ExchangeRatesModule } from '../modules/exchange-rates/exchange-rates.module';
import { BudgetsModule } from '../modules/budgets/budgets.module';
import { WorkspacesModule } from '../modules/workspaces/workspaces.module';

@Module({
  imports: [
    CategoriesModule,
    TransactionsModule,
    ExchangeRatesModule,
    BudgetsModule,
    WorkspacesModule,
  ],
  providers: [
    BotService,
    GeminiService,
    ReportService,
    CommandHandler,
    VoiceHandler,
    TextHandler,
    CallbackHandler,
  ],
  controllers: [BotController],
  exports: [BotService],
})
export class BotModule {}
