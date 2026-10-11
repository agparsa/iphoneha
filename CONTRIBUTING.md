# راهنمای توسعه

قواعدی که کد این مخزن با آن‌ها نوشته و بررسی می‌شود. بیشترشان خودکار اجرا می‌شوند (هوک پیش از کامیت و CI)؛ این صفحه می‌گوید چرا و چطور.

## ابزارها

| ابزار      | نسخه                         | از کجا                                                         |
| ---------- | ---------------------------- | -------------------------------------------------------------- |
| Node.js    | `22.12` یا بالاتر (`.nvmrc`) | `nvm use`                                                      |
| pnpm       | `10.28` (`packageManager`)   | `corepack enable`                                              |
| PostgreSQL | 16                           | `pnpm infra:up` (Docker) یا نصب محلی                           |
| Redis      | 7                            | همان                                                           |
| Chromium   | نسخهٔ Playwright برای E2E    | `pnpm --filter @iphoneha/e2e exec playwright install chromium` |

```bash
pnpm install            # وابستگی‌ها + نصب هوک پیش از کامیت (simple-git-hooks)
cp .env.example .env    # یک .env در ریشه؛ API و وب هر دو همان را می‌خوانند
pnpm infra:up           # Postgres، Redis، MinIO
pnpm db:migrate && pnpm db:seed
pnpm dev                # shared (watch) + API روی :4000 + وب روی :3000
```

## پیش از هر کامیت

هوک `pre-commit` (در `lint-staged.config.mjs`) روی فایل‌های stage‌شده اجرا می‌شود:

- **Prettier** روی همه‌چیز (`ts, tsx, js, mjs, cjs, json, yml, css, md`).
- **ESLint `--fix`** روی فایل‌های کد، از داخل همان بسته‌ای که فایل مال آن است (هر بسته پیکربندی و باینری ESLint خودش را دارد).

خطای ESLint کامیت را متوقف می‌کند و تغییرها به حالت قبل برمی‌گردند؛ خطا را رفع کنید، نه هوک را (`SKIP_SIMPLE_GIT_HOOKS=1` فقط برای وضعیت اضطراری است و CI همان بررسی‌ها را دوباره می‌کند).

همان بررسی‌ها به شکل دستی:

```bash
pnpm format            # نوشتن قالب Prettier روی کل مخزن
pnpm format:check      # فقط بررسی (همان چیزی که CI می‌زند)
pnpm lint              # ESLint در چهار بسته: api، web، shared، e2e
pnpm typecheck         # tsc --noEmit در چهار بسته
pnpm test              # تست‌های واحد (shared + api)
pnpm test:integration  # API واقعی + Postgres + Redis (پایگاه دادهٔ DATABASE_URL_TEST)
pnpm test:e2e          # Playwright؛ API و وب باید بالا باشند (README ← تست‌ها)
pnpm test:all          # هر سه سطح
```

## قواعد کد

**قالب** — Prettier با `printWidth 110`، تک‌کوتیشن، سمی‌کالن، `trailingComma: all`. بحثی دربارهٔ قالب نداریم؛ ابزار تصمیم می‌گیرد. کامیت‌های صرفاً قالب‌بندی در `.git-blame-ignore-revs` ثبت می‌شوند؛ یک بار در هر clone: `git config blame.ignoreRevsFile .git-blame-ignore-revs`.

**TypeScript** — `strict` در همهٔ بسته‌ها، `verbatimModuleSyntax` در shared. تایپ `any` هشدار می‌دهد و در کد تازه پذیرفته نیست؛ برای دادهٔ بیرونی (JSON درگاه، بدنهٔ درخواست) از `unknown` و اسکیمای zod استفاده کنید.

**ESLint** (پیکربندی flat در هر بسته، با اطلاعات تایپ):

| قانون                                        | چرا                                                                                                                                         |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `no-floating-promises`                       | پرامیسی که کسی منتظرش نیست کاری است که بی‌صدا شکست می‌خورد: تأیید پرداخت، پیامک، سطر گزارش فعالیت. اگر عمداً منتظر نمی‌مانید `void` بنویسید |
| `no-misused-promises`                        | تابع async جای callback همگام (به‌جز `onClick` و آرگومان‌های رویداد که استثنای پذیرفته‌شده‌اند)                                             |
| `await-thenable`                             | `await` روی چیزی که پرامیس نیست                                                                                                             |
| `consistent-type-imports` (inline)           | `import { type X }` — تایپ‌ها در خروجی نمی‌مانند                                                                                            |
| `eqeqeq` (به‌جز `null`)                      | `==` فقط برای `x == null`                                                                                                                   |
| `prefer-const`، `no-var`                     |                                                                                                                                             |
| `no-unused-vars` با پیشوند `_`               | پارامتر یا متغیر عمداً بی‌استفاده را با `_` شروع کنید                                                                                       |
| `no-console` در API (به‌جز `warn` و `error`) | لاگ از طریق Logger نست؛ اسکریپت‌های `prisma/` و `main.ts` مستثنی‌اند                                                                        |
| Next.js `core-web-vitals`                    | تصویر، فونت و اسکریپت با کامپوننت‌های Next؛ استثنا فقط با `eslint-disable` و دلیل در همان خط                                                |

**قراردادهای پروژه**

- متن‌های رابط کاربری و پیام خطاها **فارسی** و با اعداد فارسی از فرمت‌کننده‌های `@iphoneha/shared` (`formatNumberFa`، `formatToman`، `formatJalali`، …)؛ عدد خام در JSX ننویسید.
- خطاهای API از `Errors.*` با **کد ثابت** (`TOO_MANY_OPEN_ORDERS`) و پیام فارسی؛ کلاینت روی کد شرط می‌گذارد، نه روی متن.
- هر ورودی HTTP با اسکیمای zod در `packages/shared/src/schemas` اعتبارسنجی می‌شود؛ همان اسکیما در فرم وب هم استفاده می‌شود.
- تنظیمات فقط از `apps/api/src/config/env.config.ts` (zod) خوانده می‌شوند؛ `process.env` جای دیگری خوانده نمی‌شود. کلید و رمز هرگز در کد، تست، لاگ یا کامیت نمی‌آید (`env.production.example` فقط `CHANGE_ME`).
- هر عمل مدیر که داده را عوض می‌کند سطر `audit` می‌نویسد و پشت مجوز (`permissions`) است؛ تست RBAC در `test/security.int-spec.ts` ماتریس نقش‌ها را قفل کرده است.
- تغییر اسکیمای دیتابیس فقط با migration نام‌دار Prisma (`pnpm db:migrate:dev --name …`) که روی نصب موجود بی‌خطا اجرا شود؛ در `bootstrap-root.sh` خودکار اعمال می‌شود.
- کنترل‌های امنیتی و دلیل هرکدام در `docs/SECURITY.md` است؛ اگر یکی را شل می‌کنید، همان‌جا بنویسید چرا.

## تست

- منطق خالص (تقویم، قیمت، اقساط، اعتبارسنجی) → تست واحد کنار کد (`*.spec.ts`).
- هر مسیر HTTP تازه → دست‌کم یک تست یکپارچه در `apps/api/test/*.int-spec.ts` (اپ واقعی با `configureHttp`، پایگاه دادهٔ تست با `resetDb`).
- هر جریان مشتری تازه → تست Playwright در `e2e/tests` (به فارسی نام‌گذاری می‌شوند؛ دسترس‌پذیری axe و سئو هم همان‌جاست).
- تست‌های امنیتی (`security.int-spec.ts` و `e2e/tests/security.spec.ts`) با هر تغییر در احراز هویت، نقش‌ها، هدرها، آپلود یا پرداخت باید سبز بمانند و در صورت افزودن کنترل تازه، مورد تازه بگیرند.

## کامیت و CI

پیام کامیت: `نوع(دامنه): توضیح فارسی کوتاه` — نوع یکی از `feat`، `fix`، `perf`، `security`، `refactor`، `test`, `docs`, `chore`؛ در بدنه، «چرا» را بنویسید نه «چه». هر کامیت باید به‌تنهایی lint، typecheck و تست‌ها را پاس کند.

CI (`.github/workflows/ci.yml`) روی هر push و pull request: `format:check` → `lint` → `typecheck` → واحد → یکپارچه → `build`، و بعد E2E روی بیلد واقعی. سبز نبودن CI یعنی ادغام نمی‌شود.

## انتشار

1. روی commit نهایی: `pnpm test:all` سبز، `pnpm build` بی‌خطا.
2. بسته از همان commit ساخته می‌شود (فایل‌های خارج از گیت داخلش نمی‌آیند):

   ```bash
   git archive --prefix=iphoneha/ HEAD | gzip -9 > iphoneha-deploy.tar.gz
   sha256sum iphoneha-deploy.tar.gz
   git bundle create iphoneha.bundle --all      # تاریخچه، برای پشتیبان
   ```

3. تمرین نصب روی کپی محیط واقعی (README استقرار ← «تمرین»)، بعد آپلود در `/home/iphoneha` با تیک Overwrite و اجرای دستور نصب با root — جزئیات، متغیرها و اسکریپت‌های کلیدها در `deploy/README.md`.
4. یادداشت تحویل (نسخه، sha256، migration‌ها، کارهای مانده) به‌روز شود.
