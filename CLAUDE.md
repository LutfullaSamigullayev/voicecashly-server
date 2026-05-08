# CLAUDE.md — voicecashly-server

Bu fayl Claude Code (claude.ai/code) uchun **backend** kodi bilan ishlash bo'yicha qo'llanma. Frontend uchun alohida `voicecashly-client/` repo mavjud.

## Loyiha haqida

**VoiceCashly backend** — NestJS asosida qurilgan ovozli moliyaviy boshqaruv server. Foydalanuvchi Telegram orqali ovoz yoki matn yuboradi → Gemini AI niyatni tushunadi → tranzaksiya saqlanadi → web dashboard'da ko'rinadi.

**Stack:** NestJS 10 · Prisma 5 · PostgreSQL (Supabase) · grammY · Google Gemini AI · JWT  
**Deploy:** Render (backend) · Supabase (DB)

---

## Komandalar

Hammasi `voicecashly-server/` ichidan ishga tushadi:

```bash
npm run start:dev      # Hot reload (localhost:3001)
npm run build          # TypeScript → dist/
npm run start:prod     # node dist/main.js
npm run lint           # ESLint --fix
npm run test           # Jest
```

### Prisma

```bash
npx prisma migrate dev --name <name>   # Migratsiya yaratish va qo'llash
npx prisma db seed                      # Default kategoriyalarni urug'lantirish
npx prisma generate                     # Schema o'zgargandan keyin client qayta yaratish
npx prisma studio                       # DB ko'rish uchun GUI
```

### Telegram Webhook

```bash
curl "https://api.telegram.org/bot{BOT_TOKEN}/setWebhook" \
  -d "url=https://voicecashly-server.onrender.com/bot/webhook"
```

---

## Environment Variables

`.env.example` → `.env` nusxalab to'ldiring:

| Variable | Tavsif |
|----------|--------|
| `DATABASE_URL` | Supabase PostgreSQL pool ulanishi |
| `DIRECT_URL` | Migratsiya uchun direct ulanish |
| `BOT_TOKEN` | @BotFather'dan olingan Telegram bot tokeni |
| `WEBHOOK_URL` | Server public URL'i |
| `GEMINI_API_KEY` | aistudio.google.com'dan olingan kalit |
| `JWT_SECRET` | Min 32 belgi, JWT imzolash uchun |

---

## Arxitektura

### Modullar tuzilishi

```
src/
├── main.ts                    # Bootstrap: ValidationPipe (whitelist+transform), CORS, port 3001
├── app.module.ts              # Root: ConfigModule (global), ScheduleModule, barcha feature modullar
├── shared/prisma/             # PrismaService — singleton DB client, hamma joyga inject qilinadi
├── common/
│   ├── guards/jwt-auth.guard.ts        # Bearer token o'qiydi, req.user = {sub: userId, ...}
│   └── filters/http-exception.filter.ts
├── modules/                   # REST API modullari (har biri service + controller + module)
│   ├── users/                 # Auth, settings, Telegram login (telegram-auth.service.ts)
│   ├── workspaces/            # Personal/team workspace, invite kodlar
│   ├── categories/            # Workspace bo'yicha kategoriyalar, fuzzy match
│   ├── transactions/          # CRUD + CSV export, amountUzs normalizatsiya, DTO'lar
│   ├── analytics/             # Oylik trend, kategoriya bo'yicha hisobot
│   ├── budgets/               # Kategoriya/oy bo'yicha byudjet limit
│   └── exchange-rates/        # CBU.uz USD/UZS kurslari, har kuni @Cron orqali
└── bot/
    ├── bot.module.ts          # Imports: Categories, Transactions, ExchangeRates, Budgets, Workspaces
    ├── bot.controller.ts      # POST /bot/webhook → BotService.handleUpdate()
    ├── bot.service.ts         # grammY Bot init, session, update routing
    ├── handlers/
    │   ├── voice.handler.ts   # Voice yuklab olish → Gemini → intent flow → save
    │   ├── text.handler.ts    # Matn → Gemini → o'sha intent flow
    │   ├── command.handler.ts # /start, /report, /switch, /settings, /lang, /help, /invite
    │   └── callback.handler.ts # InlineKeyboard callback'lari: usecat:, createcat:, txtype:, listcats, cancel
    └── services/
        ├── gemini.service.ts  # Google Generative AI — processVoice() + processText() → Intent
        ├── report.service.ts  # getReport(workspaceId, reportType, period) → aggregatsiya
        └── format.service.ts  # formatReport(lang, data) → bot javobi uchun lokalizatsiya
```

### Ma'lumot oqimi: Voice/Text → Tranzaksiya

```
User Telegram'da voice/text yuboradi
  → POST /bot/webhook → BotService.handleUpdate()
  → VoiceHandler / TextHandler
  → GeminiService.processVoice() yoki processText()
  → Intent qaytaradi { type, txType, amount, currency, categoryHint, missingFields, ... }
  → missingFields bo'sh emas bo'lsa: bot foydalanuvchidan so'raydi (multi-step session)
  → CategoriesService.findBestMatch(categoryHint, workspaceId, txType)
     → exact match → darhol saqlash
     → similar match → InlineKeyboard: "X ishlatamizmi?" / "Yangi yaratish" / "Ro'yxatdan tanlash"
     → match yo'q → InlineKeyboard: "X yaratamizmi?" / "Ro'yxatdan tanlash"
  → TransactionsService.create() amountUzs normalizatsiya bilan
  → Bot formatlangan tasdiq + [Bekor] [Tahrirlash] tugmalari bilan javob beradi
```

### Session State (grammY)

Bot xabarlar oralig'ida saqlash uchun `ctx.session`'dan foydalanadi:
- `session.activeWorkspaceId` — joriy workspace
- `session.lang` — `'uz' | 'ru' | 'en'`
- `session.awaitingField` — `'amount' | 'txType' | 'category' | 'category_confirm' | 'category_new'`
- `session.pendingTx` — user javobini kutayotgan partial Intent

### Auth oqimi

1. Frontend Telegram Login Widget ko'rsatadi → user Telegram ilovasida tasdiqlaydi
2. Telegram `{id, first_name, hash, auth_date, ...}` → `POST /auth/telegram`
3. `TelegramAuthService.verify()` — `BOT_TOKEN` bilan HMAC-SHA256 imzoni tekshiradi, `auth_date` ≤ 3600s
4. `UsersService.loginWithTelegram()` — User upsert + birinchi login'da personal workspace yaratadi → JWT qaytaradi
5. Himoyalangan endpointlar `@UseGuards(JwtAuthGuard)` ishlatadi — guard `req.user.sub = userId` qo'yadi

### Valyuta bilan ishlash

- Har bir tranzaksiya `amount`/`currency` (asl) va `amountUzs` (UZS'ga normallashtirilgan) ikkalasini ham saqlaydi
- CBU.uz kurslari har kuni 09:00'da `@Cron('0 9 * * *')` orqali olinadi (`ExchangeRatesModule`)
- User valyutani aytmasa, `UserSettings.defaultCurrency` jimgina ishlatiladi (so'ramaydi)

### Multi-language (i18n)

- Bot: `src/bot/locales/{uz,ru,en}.json` — `t(lang, 'key')` helper orqali ishlatiladi
- Barcha foydalanuvchiga ko'rinadigan matnlarning uz/ru/en variantlari mavjud; `ctx.session.lang` qaysi birini ishlatishni belgilaydi
- Kategoriyalarda `nameUz`, `nameRu`, `nameEn` saqlanadi — har doim user tilida ko'rsatiladi
- Tranzaksiya izohlari `noteUz`, `noteRu`, `noteEn` sifatida saqlanadi

### Workspace rollari

| Amal | OWNER | ADMIN | MEMBER |
|------|-------|-------|--------|
| Tranzaksiya qo'shish | yes | yes | yes |
| O'zining tranzaksiyasini o'chirish | yes | yes | yes |
| Boshqalarning tranzaksiyasini o'chirish | yes | yes | no |
| Kategoriya yaratish / byudjet o'rnatish | yes | yes | no |
| Member taklif qilish | yes | no | no |

Rol `TransactionsService.update/remove()` ichida tekshiriladi — MEMBER boshqa kishining yozuvini o'zgartirsa `ForbiddenException`.

### Asosiy Prisma modellari

- `Workspace` — `isPersonal: bool`, `inviteCode` (personal uchun null)
- `Transaction` — `amountUzs` barcha aggregatsiyalarda ishlatiladigan normallashtirilgan maydon; `source` enum: `TELEGRAM | MANUAL | API`
- `Category` — workspace bo'yicha, `type: INCOME | EXPENSE | BOTH`, uch tilli nomlar
- `Budget` — `(workspaceId, categoryId, month, year)` bo'yicha unique
- `RecurringTransaction` — `frequency: DAILY | WEEKLY | MONTHLY | YEARLY`, `nextDate` har ishga tushgandan keyin oldinga suriladi
- `User` — `telegramId: BigInt @unique`, til `Language` enum (UZ/RU/EN)
- `ExchangeRate` — `from`/`to`/`rate`/`date`, CBU.uz'dan kuniga olinadi

### Gemini Intent sxemasi

`GeminiService` `Intent` obyektini qaytaradi. `INTENT_PROMPT` (`gemini.service.ts` ichida) — bot O'zbek/Rus/Ingliz moliyaviy iboralarni qanday tushunishini boshqaruvchi yagona haqiqat manbai. `type` maydoni routing'ni belgilaydi: `ADD_TRANSACTION | QUERY_REPORT | DELETE_LAST | UNKNOWN`.

---

## Konventsiyalar

- **DTO validatsiya:** `class-validator` dekoratorlari + `main.ts`'da global `ValidationPipe({ whitelist: true, transform: true })`. Yangi endpoint qilsangiz DTO yarating.
- **PrismaService** — `shared/prisma/`'dan inject qiling, har bir module'da yangi instance yaratmang.
- **Auth guard** — barcha himoyalangan endpoint'larga `@UseGuards(JwtAuthGuard)` qo'ying. `req.user.sub` — userId.
- **Cron joblar** — `@Cron()` dekoratori bilan service ichida; `ScheduleModule.forRoot()` `app.module.ts`'da global yoqilgan.
- **Bot xatoliklari** — handler ichida tutib oling va lokalizatsiyalangan xabar bilan javob bering, throw qilmang (webhook 500 qaytarmasin).
- **Pul qiymatlari** — Prisma `Decimal(14, 2)`. JS'da `.toNumber()` faqat ko'rsatish uchun, hisob-kitobda `Decimal` saqlang.
