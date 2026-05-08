import { Module } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { ExchangeRatesController } from './exchange-rates.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule],
  providers: [ExchangeRatesService],
  controllers: [ExchangeRatesController],
  exports: [ExchangeRatesService],
})
export class ExchangeRatesModule {}
