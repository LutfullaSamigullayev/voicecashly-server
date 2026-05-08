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

### Render'ga Deploy

`render.yaml` repo ildizida mavjud. Build va start buyruqlari u yerda belgilangan:
- **Build:** `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start:** `node dist/main.js`

Deploy bo'lgach Render dashboard'da `WEBHOOK_URL` env var'ini Render URL'iga o'rnating (masalan: `https://voicecashly-server.onrender.com`). Shu bilan bot polling'dan webhook rejimiga o'tadi.

---

## Environment Variables

`.env.example` → `.env` nusxalab to'ldiring:

| Variable | Tavsif |
|----------|--------|
| `DATABASE_URL` | Supabase PostgreSQL pooled ulanishi (runtime uchun) |
| `DIRECT_URL` | Migratsiya uchun Supabase direct ulanishi |
| `BOT_TOKEN` | @BotFather'dan olingan Telegram bot tokeni |
| `WEBHOOK_URL` | Server public URL'i — local uchun bo'sh qoldiring (polling rejimi) |
| `GEMINI_API_KEY` | aistudio.google.com'dan olingan kalit |
| `JWT_SECRET` | Min 32 belgi, JWT imzolash uchun |

> Render'da `PORT` o'rnatmang — u avtomatik inject qilinadi.

---

## Arxitektura

### Modullar tuzilishi

```
src/
├── main.ts                    # Bootstrap: ValidationPipe (whitelist+transform), CORS, PORT env'dan
├── app.module.ts              # Root: ConfigModule (global), ScheduleModule, barcha feature modullar
├── shared/prisma/             # PrismaService — singleton DB client, hamma joyga inject qilinadi
├── common/
│   ├── guards/jwt-auth.guard.ts        # Bearer token o'qiydi, req.user = {sub: userId, ...}
│   └── filters/http-exception.filter.ts
├── modules/                   # REST API modullari (har biri service + controller + module)
│   ├── users/                 # Auth, settings, Telegram login (telegram-auth.service.ts)
│   ├── workspaces/            # Personal/team workspace, invite kodlar, rename/delete
│   ├── categories/            # Workspace bo'yicha kategoriyalar, fuzzy match
│   ├── transactions/          # CRUD + CSV export, amountUzs normalizatsiya, DTO'lar
│   ├── analytics/             # Oylik trend, kategoriya bo'yicha hisobot
│   ├── budgets/               # Kategoriya/oy bo'yicha byudjet limit
│   └── exchange-rates/        # CBU.uz USD/UZS kurslari, har kuni @Cron orqali
└── bot/
    ├── bot.module.ts          # Imports: Categories, Transactions, ExchangeRates, Budgets, Workspaces
    ├── bot.controller.ts      # POST /bot/webhook → BotService.handleUpdate()
    ├── bot.service.ts         # grammY Bot init, session, startup'da setMyCommands
    ├── helpers/
    │   └── commands.ts        # COMMANDS_BY_LANG — bot menyu uchun umumiy komandalar ro'yxati
    ├── handlers/
    │   ├── voice.handler.ts   # Voice yuklab olish → Gemini multimodal → intent flow → save
    │   ├── text.handler.ts    # Matn → Gemini → o'sha intent flow; rename_workspace ham shu yerda
    │   ├── command.handler.ts # /start (lang+join), /report, /switch, /settings, /lang, /help, /invite
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

### Callback Handler'lar (callback.handler.ts)

| Callback data | Amal |
|---------------|------|
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
      → Tilni session + DB'ga saqlash
      → Bu chat uchun setMyCommands (tanlangan til)
      → Agar mavjud workspace'lar bo'lsa: ro'yxatini ko'rsatish + "Yangi yaratish" tugmasi
      → Yangi foydalanuvchi bo'lsa (workspace yo'q): "Shaxsiy / Jamoa" yaratish menyusi

/start join_<inviteCode>   (Telegram deep link, /invite'dan)
  → joinByInviteCode(userId, code)
  → activeWorkspaceId = qo'shilgan workspace
  → Tasdiqlash xabari
```

### Invite Tizimi

- `/invite` buyrug'i Telegram deep link yaratadi: `https://t.me/<botUsername>?start=join_<inviteCode>`
- Faqat jamoa workspace'larida `inviteCode` mavjud; shaxsiy workspace'da xato qaytadi
- Faqat OWNER invite link yarata oladi
- Qabul qiluvchi linkni bosadi → bot `/start join_<code>` ni qayta ishlaydi → MEMBER sifatida qo'shiladi

### Workspace Boshqaruvi (/settings orqali)

- **Nomini o'zgartirish** (OWNER yoki ADMIN): `/settings` → Hisob sozlamalari → Nomini o'zgartirish → yangi nom yozing
- **O'chirish** (faqat OWNER): tasdiqlash talab qilinadi; barcha tranzaksiya, kategoriya, byudjet, takrorlanadigan tranzaksiyalar ham o'chiriladi; agar yagona workspace bo'lsa — bloklangan

### Commands Menyusi

`bot.service.ts` startup'da 3 til kodi (`uz`, `ru`, `en`) uchun global `setMyCommands` chaqiradi. Foydalanuvchi tilni o'zgartirsa (`/lang` yoki `/start` orqali), shu chat uchun `scope: { type: 'chat', chat_id }` bilan `setMyCommands` qayta chaqiriladi. Umumiy komandalar ro'yxati `src/bot/helpers/commands.ts` da joylashgan.

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

### Asosiy Prisma modellari

- `Workspace` — `isPersonal: bool`, `inviteCode` (shaxsiy workspace'da null)
- `Transaction` — `amountUzs` barcha aggregatsiyalarda ishlatiladigan normallashtirilgan maydon; `source` enum: `TELEGRAM | MANUAL | API`
- `Category` — workspace bo'yicha, `type: INCOME | EXPENSE | BOTH`, uch tilli nomlar
- `Budget` — `(workspaceId, categoryId, month, year)` bo'yicha unique
- `RecurringTransaction` — `frequency: DAILY | WEEKLY | MONTHLY | YEARLY`; workspace bilan `categoryId` orqali bog'liq (to'g'ridan-to'g'ri `workspaceId` maydoni yo'q)
- `User` — `telegramId: BigInt @unique`, til `Language` enum (UZ/RU/EN) sifatida
- `ExchangeRate` — `from`/`to`/`rate`/`date`, CBU.uz'dan kuniga olinadi

### Gemini AI

**Faqat Google Gemini ishlatiladi** — Groq, Deepgram, Whisper yo'q. Ovoz va matn ikkalasi ham `@google/generative-ai` orqali ishlaydi.

- Voice: audio buffer base64 `inlineData` sifatida bitta multimodal so'rovda yuboriladi
- Modellar (fallback bilan): `gemini-2.5-flash` → `gemini-2.0-flash` → `gemini-2.5-flash-lite`
- `INTENT_PROMPT` (`gemini.service.ts` ichida) — bot O'zbek/Rus/Ingliz moliyaviy iboralarni qanday tushunishini boshqaruvchi yagona haqiqat manbai
- `type` maydoni routing'ni belgilaydi: `ADD_TRANSACTION | QUERY_REPORT | DELETE_LAST | UNKNOWN`

---

## Konventsiyalar

- **DTO validatsiya:** `class-validator` dekoratorlari + `main.ts`'da global `ValidationPipe({ whitelist: true, transform: true })`. Yangi endpoint qilsangiz DTO yarating.
- **PrismaService** — `shared/prisma/`'dan inject qiling, har bir module'da yangi instance yaratmang.
- **Auth guard** — barcha himoyalangan endpoint'larga `@UseGuards(JwtAuthGuard)` qo'ying. `req.user.sub` — userId.
- **Cron joblar** — `@Cron()` dekoratori bilan service ichida; `ScheduleModule.forRoot()` `app.module.ts`'da global yoqilgan.
- **Bot xatoliklari** — handler ichida tutib oling va lokalizatsiyalangan xabar bilan javob bering, throw qilmang (webhook 500 qaytarmasin).
- **Pul qiymatlari** — Prisma `Decimal(14, 2)`. JS'da `.toNumber()` faqat ko'rsatish uchun, hisob-kitobda `Decimal` saqlang.
- **Workspace o'chirish** — cascade delete sxemada yo'q; `WorkspacesService.deleteWorkspace()` tartib bilan o'chiradi: `Transaction.recurringId` nulllash → RecurringTransaction → Budget → Transaction → Category → WorkspaceSettings → WorkspaceMember → Workspace.
