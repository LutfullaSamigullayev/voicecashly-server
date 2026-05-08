import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../../shared/prisma/prisma.service';

@Injectable()
export class ExchangeRatesService {
  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 9 * * *')
  async updateFromCbu() {
    try {
      const res = await fetch('https://cbu.uz/uz/arkhiv-kursov-valyut/json/');
      const data = await res.json() as any[];
      const usd = data.find(r => r.Ccy === 'USD');
      if (!usd) return;

      await this.prisma.exchangeRate.create({
        data: { from: 'USD', to: 'UZS', rate: parseFloat(usd.Rate) },
      });
      console.log(`Exchange rate updated: 1 USD = ${usd.Rate} UZS`);
    } catch (err) {
      console.error('Failed to update exchange rates:', err);
    }
  }

  async getLatest() {
    return this.prisma.exchangeRate.findFirst({
      where: { from: 'USD', to: 'UZS' },
      orderBy: { date: 'desc' },
    });
  }

  async getRate(from: 'USD' | 'UZS', to: 'USD' | 'UZS'): Promise<number> {
    if (from === to) return 1;
    const rate = await this.getLatest();
    if (!rate) return 12700;
    return from === 'USD' ? Number(rate.rate) : 1 / Number(rate.rate);
  }
}
