import { Module } from '@nestjs/common';
import { BudgetsService } from './budgets.service';
import { BudgetsController } from './budgets.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [BudgetsService],
  controllers: [BudgetsController],
  exports: [BudgetsService],
})
export class BudgetsModule {}
