import { Controller, Get, UseGuards } from '@nestjs/common';
import { ExchangeRatesService } from './exchange-rates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(private readonly exchangeRatesService: ExchangeRatesService) {}

  @Get('latest')
  async latest() {
    return this.exchangeRatesService.getLatest();
  }
}
