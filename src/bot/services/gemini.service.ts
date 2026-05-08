import { GoogleGenerativeAI } from '@google/generative-ai';
import { Injectable } from '@nestjs/common';

export interface Intent {
  type: 'ADD_TRANSACTION' | 'QUERY_REPORT' | 'DELETE_LAST' | 'UNKNOWN';
  txType: 'INCOME' | 'EXPENSE' | null;
  amount: number | null;
  currency: 'UZS' | 'USD' | null;
  categoryHint: string | null;
  note: string | null;
  period: 'today' | 'week' | 'month' | 'year' | null;
  detectedLang: 'uz' | 'ru' | 'en';
  missingFields: string[];
  reportType: 'income' | 'expense' | 'balance' | 'top_expense' | 'top_income' | 'by_category' | null;
}

const INTENT_PROMPT = `
Sen moliyaviy bot assistentisan. Quyidagi JSON ni qaytargin. FAQAT JSON.

{
  "type": "ADD_TRANSACTION" | "QUERY_REPORT" | "DELETE_LAST" | "UNKNOWN",
  "txType": "INCOME" | "EXPENSE" | null,
  "amount": number | null,
  "currency": "UZS" | "USD" | null,
  "categoryHint": string | null,
  "note": string | null,
  "period": "today" | "week" | "month" | "year" | null,
  "detectedLang": "uz" | "ru" | "en",
  "missingFields": [],
  "reportType": "income" | "expense" | "balance" | "top_expense" | "top_income" | "by_category" | null
}

=== KIRIM (o'zbek) ===
tushdi, keldi, oldik, oldim, tushumdik, daromad, kirim, oladik, qabul qildik
- "ovqatdan yuz ming tushdi" → INCOME, categoryHint: "Ovqat/mahsulot"
- "ijaradan besh yuz ming keldi" → INCOME, categoryHint: "Ijara tushumi"
- "ikki million oylik tushdi" → INCOME, categoryHint: "Maosh"
- "savdodan uch million oldik" → INCOME, categoryHint: "Savdo tushumi"
- "mijozdan to'lov keldi bir million" → INCOME, categoryHint: "Xizmat haqqi"

=== CHIQIM (o'zbek) ===
ketdi, sarfladik, to'ladik, berdik, xarajat, chiqim, sotib oldik
- "ovqatga yuz ming so'm ketdi" → EXPENSE, categoryHint: "Oziq-ovqat"
- "ovqatga yuz ming so'm" → EXPENSE (fe'lsiz — default EXPENSE)
- "logistikaga bir yarim million ketdi" → EXPENSE, categoryHint: "Logistika"
- "benzin uchun ellik ming" → EXPENSE, categoryHint: "Transport"
- "reklama uchun ikki yuz ming sarfladik" → EXPENSE, categoryHint: "Marketing"

=== KIRIM (rus) ===
пришло, получили, выручка, доход, поступление, заработали
- "пришло 500 тысяч от клиента" → INCOME, categoryHint: "Xizmat haqqi"
- "выручка за день 2 миллиона" → INCOME, categoryHint: "Savdo tushumi"

=== CHIQIM (rus) ===
ушло, потратили, заплатили, расход, купили
- "ушло 150 тысяч на логистику" → EXPENSE, categoryHint: "Logistika"

=== HISOBOT SO'ROVLARI ===
QUERY_REPORT turini ishlatiladi. reportType aniqlanadi:
- "bu oyda qancha kirim bo'ldi" → reportType: "income", period: "month"
- "bu oyda qancha sarfladik" → reportType: "expense", period: "month"
- "bugungi balans" → reportType: "balance", period: "today"
- "qaysi kategoriyaga ko'p pul ketdi" → reportType: "top_expense", period: "month"
- "qayerdan ko'p daromad keldi" → reportType: "top_income", period: "month"
- "logistikaga bu oy qancha ketdi" → reportType: "by_category", period: "month", categoryHint: "Logistika"
- "сколько потратили в этом месяце" → reportType: "expense", period: "month"
- "how much did we earn this week" → reportType: "income", period: "week"

=== MIQDOR FORMATLARI ===
yuz ming=100000, bir yarim million=1500000, ikki million=2000000
500 ming=500000, 1.5 mln=1500000, 100k=100000
сто тысяч=100000, два миллиона=2000000

=== VALYUTA ===
so'm/sum/сум/UZS → UZS
dollar/доллар/$/USD → USD
Aytilmagan → null

=== NOANIQ HOLATLAR — missingFields ===
Quyidagi hollarda tegishli fieldni missingFields ga qo'sh:
- Miqdor aytilmagan → ["amount"]
- Kirim/chiqim aniqlab bo'lmaydi → ["txType"]
`;

@Injectable()
export class GeminiService {
  private client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  private model = this.client.getGenerativeModel({ model: 'gemini-2.0-flash' });
  private fallbackModel = this.client.getGenerativeModel({ model: 'gemini-1.5-flash' });

  async processVoice(audioBuffer: Buffer, mimeType = 'audio/ogg'): Promise<Intent> {
    return this.withFallback(model =>
      model.generateContent([
        { inlineData: { data: audioBuffer.toString('base64'), mimeType } },
        { text: INTENT_PROMPT },
      ]).then(r => this.parseIntent(r.response.text())),
    );
  }

  async processText(text: string): Promise<Intent> {
    return this.withFallback(model =>
      model.generateContent(`${INTENT_PROMPT}\n\nFoydalanuvchi xabari: ${text}`)
        .then(r => this.parseIntent(r.response.text())),
    );
  }

  async translateCategory(hint: string): Promise<{ uz: string; ru: string; en: string }> {
    try {
      const result = await this.withFallback(model =>
        model.generateContent(
          `Tarjima qil: "${hint}" so'zini quyidagi JSON formatida qaytargin. FAQAT JSON:\n{"uz":"...","ru":"...","en":"..."}`,
        ).then(r => r.response.text()),
      ) as unknown as string;
      return JSON.parse((result as string).replace(/```json|```/g, '').trim());
    } catch {
      return { uz: hint, ru: hint, en: hint };
    }
  }

  private async withFallback<T>(fn: (model: any) => Promise<T>): Promise<T> {
    try {
      return await fn(this.model);
    } catch (err: any) {
      if (err?.status === 429 || err?.message?.includes('quota')) {
        console.warn('gemini-2.0-flash quota exceeded, falling back to gemini-1.5-flash');
        return await fn(this.fallbackModel);
      }
      throw err;
    }
  }

  private parseIntent(raw: string): Intent {
    try {
      return JSON.parse(raw.replace(/```json|```/g, '').trim()) as Intent;
    } catch {
      return {
        type: 'UNKNOWN',
        txType: null,
        amount: null,
        currency: null,
        categoryHint: null,
        note: null,
        period: null,
        detectedLang: 'uz',
        missingFields: [],
        reportType: null,
      };
    }
  }
}
