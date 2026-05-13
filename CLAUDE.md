# CLAUDE.md — voicecashly-server

Bu fayl Claude Code (claude.ai/code) uchun **backend** kodi bilan ishlash bo'yicha qo'llanma. Frontend uchun alohida `voicecashly-client/` repo mavjud.

## Loyiha haqida

**VoiceCashly backend** — NestJS asosida qurilgan ovozli moliyaviy boshqaruv server. Foydalanuvchi Telegram orqali ovoz yoki matn yuboradi → Gemini AI niyatni tushunadi → tranzaksiya saqlanadi → web dashboard'da ko'rinadi.

**Stack:** NestJS 10 · Prisma 5 · PostgreSQL (Supabase) · grammY + @grammyjs/runner · Google Gemini AI · JWT
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

### Render'ga Deploy

`render.yaml` repo ildizida mavjud. Build va start buyruqlari u yerda belgilangan:
- **Build:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start:** `node dist/main.js`

Deploy bo'lgach Render dashboard'da `WEBHOOK_URL` env var'ini Render URL'iga o'rnating (masalan: `https://voicecashly-server.onrender.com`). Shu bilan bot polling'dan webhook rejimiga o'tadi.

> **Render free tier sovuq start:** 15 daqiqa harakatsizlikdan keyin xizmat to'xtaydi. `KeepAliveService` (`@Cron('*/14 * * * *')`) har 14 daqiqada o'zini ping qilib turadi (`RENDER_EXTERNAL_URL` yoki hardkodlangan URL). Frontend tomonida ham sahifa yuklanganda warm-up ping yuboradi.

---

## Environment Variables

`.env.example` → `.env` nusxalab to'ldiring:

| Variable | Tavsif |
|----------|--------|
| `DATABASE_URL` | Supabase PostgreSQL pooled ulanishi (runtime uchun) |
| `DIRECT_URL` | Migratsiya uchun Supabase direct ulanishi |
| `BOT_TOKEN` | @BotFather'dan olingan Telegram bot tokeni |
| `BOT_USERNAME` | Bot username (`@`-siz), invite link yaratish va `bot-auth` deep link uchun. Default: `VoiceCashlyBot` |
| `WEBHOOK_URL` | Server public URL'i — local uchun bo'sh qoldiring (polling rejimi) |
| `RENDER_EXTERNAL_URL` | Render avtomatik to'ldiradi, `KeepAliveService` shuni ping qiladi |
| `GEMINI_API_KEY` | aistudio.google.com'dan olingan kalit |
| `JWT_SECRET` | Min 32 belgi, JWT imzolash uchun (TTL: 30 kun) |

> Render'da `PORT` o'rnatmang — u avtomatik inject qilinadi.

---

## Arxitektura

### Modullar tuzilishi

```
src/
├── main.ts                    # Bootstrap: ValidationPipe (whitelist+transform), enableCors() (origin: *), BigInt toJSON, PORT env'dan, GET / va /health
├── app.module.ts              # Root: ConfigModule (global), ScheduleModule, barcha feature modullar, KeepAliveService provider
├── shared/
│   ├── prisma/                # PrismaService — singleton DB client, hamma joyga inject qilinadi
│   ├── default-categories.ts  # Seed uchun standart 3-tilli kategoriyalar
│   └── keep-alive/keep-alive.service.ts  # @Cron('*/14 * * * *') — Render free tier sovuq startni oldini olish
├── common/
│   ├── guards/jwt-auth.guard.ts        # Bearer token o'qiydi, req.user = {sub: userId, ...}
│   └── filters/http-exception.filter.ts
├── modules/                   # REST API modullari (har biri service + controller + module)
│   ├── users/                 # Auth, settings, Telegram login + web login (bot-auth flow)
│   │   ├── users.controller.ts          # /auth/telegram, /auth/bot/start, /auth/bot/check, /auth/me, /settings
│   │   ├── users.service.ts             # loginWithTelegram, findById, updateSettings
│   │   ├── telegram-auth.service.ts     # Login Widget HMAC verify
│   │   ├── bot-auth.service.ts          # LoginToken: start/confirm/check (web login orqali bot)
│   │   └── users.module.ts              # JwtModule.register({ secret, expiresIn: '30d' })
│   ├── workspaces/            # Personal/team workspace, invite kodlar, rename/delete
│   ├── categories/            # Workspace bo'yicha kategoriyalar, fuzzy match
│   ├── transactions/          # CRUD + CSV export, amountUzs normalizatsiya, DTO'lar
│   ├── analytics/             # Oylik trend, kategoriya bo'yicha hisobot
│   ├── budgets/               # Kategoriya/oy bo'yicha byudjet limit
│   └── exchange-rates/        # CBU.uz USD/UZS kurslari, har kuni @Cron orqali
└── bot/
    ├── bot.module.ts          # Imports: Categories, Transactions, ExchangeRates, Budgets, Workspaces, Users (BotAuthService uchun)
    ├── bot.controller.ts      # POST /bot/webhook → BotService.handleUpdate()
    ├── bot.service.ts         # grammY Bot init, session (in-memory), @grammyjs/runner orqali concurrent polling, sequentialize per-chat, startup'da setMyCommands
    ├── helpers/
    │   └── commands.ts        # COMMANDS_BY_LANG — bot menyu uchun umumiy komandalar ro'yxati
    ├── handlers/
    │   ├── voice.handler.ts   # Voice yuklab olish → Gemini multimodal → intent flow → save
    │   ├── text.handler.ts    # Matn → Gemini → o'sha intent flow; rename_workspace ham shu yerda
    │   ├── command.handler.ts # /start (lang+join+weblogin), /report, /switch, /settings, /lang, /help, /invite, /today, /income, /expense, /top, /balance
    │   └── callback.handler.ts # Barcha InlineKeyboard callback'lari (ro'yxat quyida)
    ├── locales/
    │   ├── uz.json            # O'zbek tarjimlari
    │   ├── ru.json            # Rus tarjimlari
    │   └── en.json            # Ingliz tarjimlari
    └── services/
        ├── gemini.service.ts  # Google Generative AI — processVoice() + processText() → Intent
        ├── report.service.ts  # getReport(workspaceId, reportType, period) → aggregatsiya
        └── format.service.ts  # formatReport() + formatTransaction() → lokalizatsiyalangan matn
```

### Bot Runtime (grammY + @grammyjs/runner)

`bot.service.ts` ikki rejimda ishlaydi:
- **Polling** (lokal, `WEBHOOK_URL` bo'sh): `@grammyjs/runner` ishlatadi (`run(bot, { runner: { fetch: { allowed_updates } } })`) — concurrent update qabul qilish. Bot start oldidan `deleteWebhook({ drop_pending_updates: true })` chaqiradi.
- **Webhook** (prod, `WEBHOOK_URL` o'rnatilgan): `setWebhook(`${WEBHOOK_URL}/bot/webhook`)`, `BotController` so'rovlarni `bot.handleUpdate(update)`'ga yo'naltiradi.

`sequentialize` middleware har bir chat/user uchun update'larni ketma-ket bajarib race condition'larni oldini oladi.

### Ma'lumot oqimi: Voice/Text → Tranzaksiya

```
User Telegram'da voice/text yuboradi
  → POST /bot/webhook → BotService.handleUpdate()
  → VoiceHandler / TextHandler
  → GeminiService.processVoice() yoki processText()
      Voice: audio buffer base64 inlineData sifatida bitta multimodal so'rovda yuboriladi
      Text:  oddiy matn prompt
  → Intent qaytaradi { type, txType, amount, currency, categoryHint, missingFields, note, ... }
  → missingFields bo'sh emas bo'lsa: bot foydalanuvchidan so'raydi (multi-step session)
  → CategoriesService.findBestMatch(categoryHint, workspaceId, txType)
     → exact match → darhol saqlash
     → similar match → InlineKeyboard: "X ishlatamizmi?" / "Yangi yaratish" / "Ro'yxatdan tanlash"
     → match yo'q → InlineKeyboard: "X yaratamizmi?" / "Ro'yxatdan tanlash"
  → TransactionsService.create() amountUzs normalizatsiya bilan
  → Bot formatTransaction() card + [Bekor] [Tahrirlash] tugmalari bilan javob beradi
```

### Web Login Oqimi (LoginToken + bot-auth)

Web frontend `/auth/telegram` (Login Widget) o'rniga **bot-mediated polling flow** ishlatadi:

```
Frontend                                          Backend                            Bot
─────────                                         ───────                            ────
POST /auth/bot/start
                                          ─►   BotAuthService.start()
                                               LoginToken: random 16-byte hex
                                               status=PENDING, expiresAt=now+5min
                                               deepLink = t.me/<bot>?start=login_<token>
                                          ◄─   { token, deepLink, expiresAt }
window.open(deepLink)
                                                                                    User /start login_<token>
                                                                                    CommandHandler.handleStart()
                                                                                    LoginToken topadi, InlineKeyboard:
                                                                                      [Tasdiqlash] [Bekor qilish]
                                                                                    callback weblogin:confirm:<token>
                                                                                    → BotAuthService.confirm(token, userId)
                                                                                      → LoginToken.status = CONFIRMED, userId set
poll GET /auth/bot/check?token=...  (every 2s)
                                          ─►   BotAuthService.check(token)
                                               status=CONFIRMED → JWT sign({sub,tid})
                                               token row delete
                                          ◄─   { status:'confirmed', jwt, user }
useAuthStore.login(jwt, user)
setActive(user.workspaces[0])
navigate('/')
```

`LoginToken` Prisma modeli: `{ token: unique, userId?: nullable, status: PENDING|CONFIRMED, expiresAt, createdAt }`. TTL 5 daqiqa.

### Session State (grammY)

`SessionData` interfeysi `bot.service.ts` da belgilangan. To'liq maydonlar:

| Maydon | Tur | Maqsad |
|--------|-----|--------|
| `lang` | `'uz'\|'ru'\|'en'` | Foydalanuvchi tili (default: `'uz'`) |
| `activeWorkspaceId` | `number\|null` | Joriy faol workspace |
| `pendingTx` | `any\|null` | Maydonlar to'ldirilayotgan partial Intent |
| `awaitingField` | `string\|null` | Bot qaysi inputni kutayotgani (qiymatlar quyida) |
| `lastTxId` | `number\|null` | Oxirgi saqlangan tranzaksiya ID'si |
| `lastTxMessageId` | `number\|null` | Oxirgi tranzaksiya card xabari ID'si |
| `lastBotPromptId` | `number\|null` | Oxirgi bot savoli xabari ID'si |
| `lastUserMsgId` | `number\|null` | Oxirgi foydalanuvchi xabari ID'si |
| `editingTxId` | `number\|null` | Tahrir qilinayotgan tranzaksiya ID'si |
| `pendingTeamName` | `string\|null` | Workspace yaratish jarayonida jamoa nomi |
| `transientMsgIds` | `number[]` | Flow tugagandan keyin o'chiriladigan xabar ID'lari |
| `pendingNewCatHint` | `string\|null` | Tasdiqlash kutilayotgan kategoriya nomi |

`awaitingField` qiymatlari: `'amount'` · `'edit_amount'` · `'edit_note'` · `'edit_category'` · `'category_new_input'` · `'edit_category_new_input'` · `'team_name'` · `'rename_workspace'`

> Eslatma: session in-memory (default grammY session). Server qayta ishga tushganda yo'qoladi. Persistence kerak bo'lsa `@grammyjs/storage-*`'ga o'tish kerak.

### Callback Handler'lar (callback.handler.ts)

| Callback data | Amal |
|---------------|------|
| `weblogin:confirm:<token>` | Web login tokenini tasdiqlash, BotAuthService.confirm() |
| `weblogin:cancel:<token>` | Web login tasdiqlashni bekor qilish (xabarni o'zgartiradi) |
| `startlang:uz/ru/en` | Tilni saqlash, shu chat uchun setMyCommands, mavjud workspace'lar yoki yaratish menyusi |
| `start:personal` | Yangi shaxsiy workspace yaratish |
| `start:team` | Jamoa nomi so'rash |
| `start:new` | Yaratish menyusini ko'rsatish (workspace ro'yxatidan) |
| `create_team:<name>` | Nomlangan jamoa workspace'i yaratish |
| `switch:<wsId>` | Faol workspace'ni almashtirish |
| `txtype:INCOME/EXPENSE` | Pending tranzaksiya uchun tur belgilash |
| `usecat:<catId>` | Pending tranzaksiyaga kategoriya biriktirish |
| `createcat:<hint>:<txType>` | Hint'dan yangi kategoriya yaratish, pending tx'ga biriktirish |
| `listcats` | Kategoriya tanlash klaviaturasini ko'rsatish |
| `newcat_input` | Foydalanuvchidan yangi kategoriya nomi so'rash |
| `confirm_newcat` | Yozilgan kategoriyani tasdiqlash va yaratish |
| `delete_tx:<txId>` | Tranzaksiyani o'chirish |
| `edit_tx:<txId>` | Tranzaksiya tahrirlash parametrlarini ko'rsatish |
| `edit_field:amount/note/category:<txId>` | Maydon tahrirlash rejimiga kirish |
| `edit_cat:<catId>:<txId>` | Tahrir qilinayotgan tx'ga yangi kategoriya saqlash |
| `edit_newcat_input` | Yangi kategoriya nomi so'rash (tahrirlash oqimi) |
| `edit_confirm_newcat` | Yangi kategoriyani yaratish va biriktirish (tahrirlash oqimi) |
| `confirm_tx:<txId>` | Tranzaksiya card'ini qulflash (tugmalarni olib tashlash) |
| `close_edit` | Tahrirlash rejimidan chiqish, asl tugmalarni tiklash |
| `cancel` | Kutilayotgan amalni bekor qilish, o'tkinchi xabarlarni o'chirish |
| `lang:uz/ru/en` | Tilni o'zgartirish, setMyCommands orqali shu chat menyusini yangilash |
| `settings:currency` | Valyuta tanlash menyusi |
| `settings:lang` | Til tanlash menyusi |
| `settings:workspace` | Workspace nomini o'zgartirish/o'chirish menyusi |
| `settings:rename_ws` | Yangi workspace nomi so'rash |
| `settings:delete_ws` | O'chirish tasdiqlash menyusi |
| `confirm_delete_ws` | Workspace'ni o'chirish, keyingisiga o'tish |
| `currency:UZS/USD` | Default valyutani saqlash |
| `noop` | Hech narsa qilmaydi (loading indikator sifatida ishlatiladi) |

### /start Oqimi

```
/start (parametrsiz)
  → Til tanlash menyusi (uz / ru / en)
  → startlang:<lang> callback
      → Tilni session + DB'ga saqlash (UserSettings.language)
      → Bu chat uchun setMyCommands (tanlangan til)
      → Agar mavjud workspace'lar bo'lsa: ro'yxatini ko'rsatish + "Yangi yaratish" tugmasi
      → Yangi foydalanuvchi bo'lsa (workspace yo'q): "Shaxsiy / Jamoa" yaratish menyusi

/start join_<inviteCode>   (Telegram deep link, /invite'dan)
  → joinByInviteCode(userId, code)
  → activeWorkspaceId = qo'shilgan workspace
  → Tasdiqlash xabari

/start login_<token>   (Web frontend'dan keladi)
  → LoginToken topiladi, expired bo'lmasligini tekshirish
  → "Tasdiqlash kerakmi?" InlineKeyboard javob:
       [✅ Tasdiqlash] [❌ Bekor qilish]
  → callback weblogin:confirm:<token> → BotAuthService.confirm() → status=CONFIRMED
```

### Foydalanuvchi yaratish

User ikki yo'l bilan yaratiladi:
1. **Bot'da `getUserId(ctx)`** (`command.handler.ts`/`callback.handler.ts`) — Telegram'dan kelgan birinchi xabarda upsert (workspace yaratilmaydi)
2. **`POST /auth/telegram`** (Telegram Login Widget — hozir frontend ishlatmaydi) — upsert qiladi, workspace yaratilmaydi

> **Diqqat:** workspace **avtomatik yaratilmaydi**. Foydalanuvchi botda `/start` qilib language tanlasagina shaxsiy workspace yaratish menyusi chiqadi. Frontend'da `/onboarding` sahifasi mavjud workspace yo'q bo'lsa ko'rinadi, lekin u faqat botga yo'naltiradi (workspace yaratish tugmasi yo'q).

### Invite Tizimi

- `/invite` buyrug'i Telegram deep link yaratadi: `https://t.me/<botUsername>?start=join_<inviteCode>`
- Faqat jamoa workspace'larida `inviteCode` mavjud; shaxsiy workspace'da xato qaytadi
- Faqat OWNER invite link yarata oladi
- Qabul qiluvchi linkni bosadi → bot `/start join_<code>` ni qayta ishlaydi → MEMBER sifatida qo'shiladi

### Workspace Boshqaruvi (/settings orqali)

- **Nomini o'zgartirish** (OWNER yoki ADMIN): `/settings` → Hisob sozlamalari → Nomini o'zgartirish → yangi nom yozing
- **O'chirish** (faqat OWNER): tasdiqlash talab qilinadi; barcha tranzaksiya, kategoriya, byudjet, takrorlanadigan tranzaksiyalar ham o'chiriladi; agar yagona workspace bo'lsa — bloklangan

### Commands Menyusi

`bot.service.ts` `onModuleInit()` da global `setMyCommands` ni 3 til kodi (`uz`, `ru`, `en`) uchun chaqiradi. Foydalanuvchi tilni o'zgartirsa (`/lang` yoki `/start` orqali), shu chat uchun `scope: { type: 'chat', chat_id }` bilan `setMyCommands` qayta chaqiriladi. Umumiy komandalar ro'yxati `src/bot/helpers/commands.ts` da joylashgan.

### Auth oqimi (REST API)

1. Frontend `POST /auth/bot/start` chaqirib token + deep link oladi (yuqoridagi Web Login oqimi)
2. Yoki Telegram Login Widget `POST /auth/telegram` (hozir frontend ishlatmaydi):
   - `TelegramAuthService.verify()` — `BOT_TOKEN` bilan HMAC-SHA256 imzoni tekshiradi, `auth_date` ≤ 3600s
   - `UsersService.loginWithTelegram()` — User upsert → JWT qaytaradi
3. JWT `expiresIn: '30d'`, payload: `{ sub: userId, tid: telegramId.toString() }`
4. Himoyalangan endpointlar `@UseGuards(JwtAuthGuard)` ishlatadi — guard `req.user.sub = userId` qo'yadi

### Valyuta bilan ishlash

- Har bir tranzaksiya `amount`/`currency` (asl) va `amountUzs` (UZS'ga normallashtirilgan) ikkalasini ham saqlaydi
- CBU.uz kurslari har kuni 09:00'da `@Cron('0 9 * * *')` orqali olinadi (`ExchangeRatesModule`)
- User valyutani aytmasa, `UserSettings.defaultCurrency` jimgina ishlatiladi (so'ramaydi)

### Multi-language (i18n)

- Bot: `src/bot/locales/{uz,ru,en}.json` — `t(lang, 'key', vars?)` helper orqali (`command.handler.ts`'da eksport)
- Barcha foydalanuvchiga ko'rinadigan matnlarning uz/ru/en variantlari mavjud; `ctx.session.lang` qaysi birini ishlatishni belgilaydi
- Til session'da ham, `UserSettings.language` (DB) da ham saqlanadi
- Kategoriyalarda `nameUz`, `nameRu`, `nameEn` saqlanadi — har doim user tilida ko'rsatiladi
- Tranzaksiya izohlari `noteUz`, `noteRu`, `noteEn` sifatida saqlanadi — faqat mos til ustuni yoziladi

### Workspace Rollari

| Amal | OWNER | ADMIN | MEMBER |
|------|-------|-------|--------|
| Tranzaksiya qo'shish | ✅ | ✅ | ✅ |
| O'zining tranzaksiyasini o'chirish | ✅ | ✅ | ✅ |
| Boshqalarning tranzaksiyasini o'chirish | ✅ | ✅ | ❌ |
| Kategoriya yaratish / byudjet o'rnatish | ✅ | ✅ | ❌ |
| Workspace nomini o'zgartirish | ✅ | ✅ | ❌ |
| Workspace'ni o'chirish | ✅ | ❌ | ❌ |
| Member taklif qilish | ✅ | ❌ | ❌ |

Rol `TransactionsService.update/remove()` ichida tekshiriladi — MEMBER boshqa kishining yozuvini o'zgartirsa `ForbiddenException`.

> ⚠️ **Ma'lum bug:** `TransactionsController.update`/`remove` `req.user.sub`'ga `'OWNER'` rolini hardkodlangan tarzda uzatadi (`transactions.controller.ts:67,72`). Bu MEMBER'ning ham boshqalarning yozuvini o'chirishiga ruxsat beradi. Rol guard'i `WorkspaceMember`'dan o'qilishi kerak.

### Asosiy Prisma modellari

- `Workspace` — `isPersonal: bool`, `inviteCode` (shaxsiy workspace'da null)
- `Transaction` — `amountUzs` barcha aggregatsiyalarda ishlatiladigan normallashtirilgan maydon; `source` enum: `TELEGRAM | MANUAL | API`; `recurringId?` — RecurringTransaction bilan bog'liqlik
- `Category` — workspace bo'yicha, `type: INCOME | EXPENSE | BOTH`, uch tilli nomlar
- `Budget` — `(workspaceId, categoryId, month, year)` bo'yicha unique
- `RecurringTransaction` — `frequency: DAILY | WEEKLY | MONTHLY | YEARLY`; workspace bilan `categoryId` orqali bog'liq (to'g'ridan-to'g'ri `workspaceId` maydoni yo'q)
- `User` — `telegramId: BigInt @unique`, til `Language` enum (UZ/RU/EN) sifatida
- `ExchangeRate` — `from`/`to`/`rate`/`date`, CBU.uz'dan kuniga olinadi
- `LoginToken` — `token: unique`, `userId?`, `status: PENDING|CONFIRMED`, `expiresAt`. Web login flow uchun (5 daqiqa TTL)

> `BigInt` (telegramId) JSON'da string sifatida serialize qilinadi (`main.ts`'da `BigInt.prototype.toJSON = function() { return this.toString() }` o'rnatilgan).

### Gemini AI

**Faqat Google Gemini ishlatiladi** — Groq, Deepgram, Whisper yo'q. Ovoz va matn ikkalasi ham `@google/generative-ai` orqali ishlaydi.

- Voice: audio buffer base64 `inlineData` sifatida bitta multimodal so'rovda yuboriladi
- Modellar (fallback bilan): `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.5-flash-lite`
- `INTENT_PROMPT` (`gemini.service.ts` ichida) — bot O'zbek/Rus/Ingliz moliyaviy iboralarni qanday tushunishini boshqaruvchi yagona haqiqat manbai
- `type` maydoni routing'ni belgilaydi: `ADD_TRANSACTION | QUERY_REPORT | DELETE_LAST | UNKNOWN`

---

## REST API Reference (frontend integratsiyasi uchun)

| Method · Path | Guard | Tavsif |
|---------------|-------|--------|
| `GET /` | yo'q | `{ status: 'ok' }` (root health) |
| `GET /health` | yo'q | `{ status: 'ok' }` |
| `POST /bot/webhook` | yo'q | grammY update — faqat Telegram chaqiradi |
| `POST /auth/telegram` | yo'q | Login Widget HMAC verify → JWT |
| `POST /auth/bot/start` | yo'q | `{ token, deepLink, expiresAt }` — web login boshlash |
| `GET /auth/bot/check?token=` | yo'q | `{ status: pending|confirmed|expired, jwt?, user? }` |
| `GET /auth/me` | JWT | Current user + settings + workspaces |
| `GET /settings` · `PATCH /settings` | JWT | UserSettings |
| `GET /workspaces/me` | JWT | `WorkspaceMember[]` with `workspace.settings` |
| `POST /workspaces` | JWT | `{ name, type: 'personal'\|'team' }` |
| `POST /workspaces/join` | JWT | `{ inviteCode }` |
| `GET /workspaces/:id` | JWT | Workspace + settings + members.user |
| `GET /workspaces/:id/invite` | JWT (OWNER) | `{ code }` |
| `GET /categories?workspaceId=` · CRUD | JWT | Category[] |
| `GET /transactions?workspaceId=&type=&categoryId=&from=&to=&page=&limit=` | JWT | `{ items, total, page, limit }` |
| `GET /transactions/summary?workspaceId=&from=&to=` | JWT | `{ income, expense, net }` (amountUzs) |
| `GET /transactions/export?workspaceId=&from=&to=` | JWT | CSV file |
| `POST/PATCH/DELETE /transactions[/:id]` | JWT | DTO bilan validatsiya |
| `GET /analytics/monthly?workspaceId=&months=` | JWT | `MonthlyPoint[]` |
| `GET /analytics/by-category?workspaceId=&type=&from=&to=` | JWT | Category breakdown |
| `GET /budgets?workspaceId=&month=&year=` · `GET /budgets/progress` · `POST /budgets` | JWT | |
| `GET /exchange-rates/latest` | JWT yoki yo'q (controller'da tekshiring) | Latest rates |

> CORS: `main.ts`'da `app.enableCors()` argumentsiz — default `Access-Control-Allow-Origin: *`. Frontend domeni o'zgarsa hech narsa qilish shart emas.

---

## Konventsiyalar

- **DTO validatsiya:** `class-validator` dekoratorlari + `main.ts`'da global `ValidationPipe({ whitelist: true, transform: true })`. Yangi endpoint qilsangiz DTO yarating. `@Type(() => Number)` query param raqamlar uchun.
- **PrismaService** — `shared/prisma/`'dan inject qiling, har bir module'da yangi instance yaratmang.
- **Auth guard** — barcha himoyalangan endpoint'larga `@UseGuards(JwtAuthGuard)` qo'ying. `req.user.sub` — userId.
- **Cron joblar** — `@Cron()` dekoratori bilan service ichida; `ScheduleModule.forRoot()` `app.module.ts`'da global yoqilgan.
- **Bot xatoliklari** — handler ichida tutib oling va lokalizatsiyalangan xabar bilan javob bering, throw qilmang (webhook 500 qaytarmasin). `bot.service.ts`'da `bot.catch()` "message is not modified" xatosini jim qiladi.
- **Pul qiymatlari** — Prisma `Decimal(14, 2)`. JS'da `.toNumber()` faqat ko'rsatish uchun, hisob-kitobda `Decimal` saqlang. Frontend `string` sifatida oladi → `Number()` orqali.
- **Workspace o'chirish** — cascade delete sxemada yo'q; `WorkspacesService.deleteWorkspace()` tartib bilan o'chiradi: `Transaction.recurringId` nulllash → RecurringTransaction → Budget → Transaction → Category → WorkspaceSettings → WorkspaceMember → Workspace.
