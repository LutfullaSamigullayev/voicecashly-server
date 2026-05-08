import { Injectable } from '@nestjs/common';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
Sen moliyaviy bot assistentisan. Foydalanuvchining xabarini tahlil qilib JSON object qaytar. FAQAT JSON, boshqa matn yo'q. Transkriptsiya buzilgan bo'lishi mumkin — kontekst bo'yicha taxmin qil.

⚠️ MUHIM QOIDA: "type" va "txType" — IKKI ALOHIDA maydon. Ularni chalkashtirma!

"type" maydoni faqat shu 4 qiymatdan biri bo'lishi shart:
  - "ADD_TRANSACTION" — agar xabarda pul tushishi/ketishi/sarflanishi haqida gap bor (kirim/chiqim qo'shish)
  - "QUERY_REPORT" — agar foydalanuvchi hisobot, balans, qancha sarflagani so'ragan bo'lsa
  - "DELETE_LAST" — agar oxirgi tranzaksiyani o'chirish so'ralsa ("oxirgisini o'chir")
  - "UNKNOWN" — yuqoridagilarning hech biri emas

"txType" maydoni faqat shu qiymatlardan biri:
  - "INCOME" — pul tushgan (kirim, daromad, oylik, tushum, keldi, oldim, qabul qildim)
  - "EXPENSE" — pul ketgan (chiqim, xarajat, sarfladim, to'ladim, oldim, ketdi, sotib oldim)
  - null — aniq emas

❌ NOTO'G'RI: { "type": "EXPENSE", ... }   — "EXPENSE" type emas, txType
✅ TO'G'RI:  { "type": "ADD_TRANSACTION", "txType": "EXPENSE", ... }

Boshqa maydonlar:
  - "amount": son yoki null (masalan 150000)
  - "currency": "UZS" | "USD" | null
  - "categoryHint": kategoriya nomi (masalan "Logistika", "Oziq-ovqat") yoki null
  - "note": string yoki null
  - "period": "today" | "week" | "month" | "year" | null
  - "detectedLang": "uz" | "ru" | "en"
  - "missingFields": array, masalan ["amount"] yoki ["txType"] yoki []
  - "reportType": "income" | "expense" | "balance" | "top_expense" | "top_income" | "by_category" | null

NAMUNA 1: "logistikaga 150 ming so'm ketdi"
{
  "type": "ADD_TRANSACTION",
  "txType": "EXPENSE",
  "amount": 150000,
  "currency": "UZS",
  "categoryHint": "Logistika",
  "note": null,
  "period": null,
  "detectedLang": "uz",
  "missingFields": [],
  "reportType": null
}

NAMUNA 2: "ovqat uchun ketdi" (miqdor aytilmagan)
{
  "type": "ADD_TRANSACTION",
  "txType": "EXPENSE",
  "amount": null,
  "currency": null,
  "categoryHint": "Oziq-ovqat",
  "note": null,
  "period": null,
  "detectedLang": "uz",
  "missingFields": ["amount"],
  "reportType": null
}

NAMUNA 3: "bu oyda qancha sarfladim"
{
  "type": "QUERY_REPORT",
  "txType": null,
  "amount": null,
  "currency": null,
  "categoryHint": null,
  "note": null,
  "period": "month",
  "detectedLang": "uz",
  "missingFields": [],
  "reportType": "expense"
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
- Miqdor aytilmagan → ["amount"]
- Kirim/chiqim aniqlab bo'lmaydi → ["txType"]
`;

@Injectable()
export class GeminiService {
  private genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  private models = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.5-flash-lite'];

  async processVoice(audioBuffer: Buffer, mimeType = 'audio/ogg', lang: 'uz' | 'ru' | 'en' = 'uz'): Promise<Intent> {
    const audioPart = { inlineData: { data: audioBuffer.toString('base64'), mimeType } };
    const prompt = `${INTENT_PROMPT}\n\nAudio xabar yuborildi (til: ${lang}). Audioni eshitib, yuqoridagi ko'rsatmalar bo'yicha JSON qaytar.`;
    const raw = await this.generateJSON([{ role: 'user', parts: [{ text: prompt }, audioPart] }]);
    console.log('[Gemini voice javob]:', raw);
    const intent = this.parseIntent(raw);
    console.log('[Parse natija]:', JSON.stringify(intent));
    return intent;
  }

  async processText(text: string): Promise<Intent> {
    const prompt = `${INTENT_PROMPT}\n\nFoydalanuvchi xabari: ${text}`;
    const raw = await this.generateJSON([{ role: 'user', parts: [{ text: prompt }] }]);
    console.log('[Gemini text javob]:', raw);
    const intent = this.parseIntent(raw);
    console.log('[Parse natija]:', JSON.stringify(intent));
    return intent;
  }

  async transcribeVoice(audioBuffer: Buffer, mimeType = 'audio/ogg', lang: 'uz' | 'ru' | 'en' = 'uz'): Promise<string> {
    const audioPart = { inlineData: { data: audioBuffer.toString('base64'), mimeType } };
    const prompt = `Audioni so'zma-so'z transkripsiya qil (til: ${lang}). FAQAT transkriptsiya matnini qaytar, boshqa hech narsa yo'q.`;
    return this.generateText([{ role: 'user', parts: [{ text: prompt }, audioPart] }]);
  }

  async transcribeCategoryName(audioBuffer: Buffer, mimeType = 'audio/ogg', lang: 'uz' | 'ru' | 'en' = 'uz'): Promise<string> {
    const audioPart = { inlineData: { data: audioBuffer.toString('base64'), mimeType } };
    const prompt = `Audiodan FAQAT KATEGORIYA NOMINI ajratib qaytar (1-3 so'z, bosh harf bilan). Tinish belgilari, qo'shimchalar (-ga, -dan), to'liq jumla, izoh KERAK EMAS. FAQAT NOM.
Misollar:
"logistikaga ketdi" → Logistika
"oziq-ovqatga sarfladim" → Oziq-ovqat
"maoshim keldi" → Maosh
"transport uchun" → Transport
"коммуналка" → Kommunal`;
    const text = await this.generateText([{ role: 'user', parts: [{ text: prompt }, audioPart] }]);
    return text.trim().replace(/[.,!?;:"'`]+$/g, '').replace(/^["'`]+/, '');
  }

  async translateCategory(hint: string): Promise<{ uz: string; ru: string; en: string }> {
    try {
      const prompt = `Tarjima qil: "${hint}" so'zini quyidagi JSON formatida qaytargin. FAQAT JSON:\n{"uz":"...","ru":"...","en":"..."}`;
      const raw = await this.generateJSON([{ role: 'user', parts: [{ text: prompt }] }]);
      return JSON.parse(raw);
    } catch {
      return { uz: hint, ru: hint, en: hint };
    }
  }

  private async generateJSON(contents: any[]): Promise<string> {
    let lastErr: any;
    for (const modelName of this.models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const result = await model.generateContent({ contents });
        return result.response.text();
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        if (status === 429 || status === 503 || (status >= 500 && status < 600)) {
          console.warn(`Gemini ${modelName} ${status}, fallback...`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Gemini unavailable');
  }

  private async generateText(contents: any[]): Promise<string> {
    let lastErr: any;
    for (const modelName of this.models) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: modelName,
          generationConfig: { temperature: 0.1 },
        });
        const result = await model.generateContent({ contents });
        return result.response.text().trim();
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.response?.status;
        if (status === 429 || status === 503 || (status >= 500 && status < 600)) {
          console.warn(`Gemini ${modelName} ${status}, fallback...`);
          continue;
        }
        throw err;
      }
    }
    throw lastErr ?? new Error('Gemini unavailable');
  }

  private parseIntent(raw: string): Intent {
    try {
      const parsed: any = JSON.parse(raw.replace(/```json|```/g, '').trim());
      return this.normalizeIntent(parsed);
    } catch {
      return this.normalizeIntent({});
    }
  }

  private normalizeIntent(p: any): Intent {
    const validTypes = ['ADD_TRANSACTION', 'QUERY_REPORT', 'DELETE_LAST', 'UNKNOWN'];
    const validTxTypes = ['INCOME', 'EXPENSE'];

    let type = p?.type;
    let txType = p?.txType;

    if (validTxTypes.includes(type)) {
      txType = type;
      type = 'ADD_TRANSACTION';
    }
    if (!validTypes.includes(type)) {
      type = (txType || p?.amount) ? 'ADD_TRANSACTION' : 'UNKNOWN';
    }
    if (txType && !validTxTypes.includes(txType)) txType = null;

    return {
      type,
      txType: txType ?? null,
      amount: typeof p?.amount === 'number' ? p.amount : null,
      currency: ['UZS', 'USD'].includes(p?.currency) ? p.currency : null,
      categoryHint: typeof p?.categoryHint === 'string' && p.categoryHint.trim() ? p.categoryHint : null,
      note: typeof p?.note === 'string' && p.note.trim() ? p.note : null,
      period: ['today', 'week', 'month', 'year'].includes(p?.period) ? p.period : null,
      detectedLang: ['uz', 'ru', 'en'].includes(p?.detectedLang) ? p.detectedLang : 'uz',
      missingFields: Array.isArray(p?.missingFields) ? p.missingFields : [],
      reportType: ['income', 'expense', 'balance', 'top_expense', 'top_income', 'by_category'].includes(p?.reportType)
        ? p.reportType
        : null,
    };
  }
}
