import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './shared/prisma/prisma.module';
import { UsersModule } from './modules/users/users.module';
import { TransactionsModule } from './modules/transactions/transactions.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { BudgetsModule } from './modules/budgets/budgets.module';
import { WorkspacesModule } from './modules/workspaces/workspaces.module';
import { ExchangeRatesModule } from './modules/exchange-rates/exchange-rates.module';
import { BotModule } from './bot/bot.module';
import { KeepAliveService } from './shared/keep-alive/keep-alive.service';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    UsersModule,
    TransactionsModule,
    CategoriesModule,
    AnalyticsModule,
    BudgetsModule,
    WorkspacesModule,
    ExchangeRatesModule,
    BotModule,
  ],
  providers: [KeepAliveService],
})
export class AppModule {}
