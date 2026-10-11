# معماری فروشگاه آیفونی‌ها

این سند قبل از نوشتن کد طراحی شده و مرجع تصمیم‌های فنی پروژه است. طرح ظاهری فروشگاه از طرح Claude Design با نام «iPhoneHa v3» گرفته شده است.

## ۱. اهداف

- فروشگاه تخصصی **فقط آیفون**، Mobile-First، RTL و فارسی
- مدل داده **Product → Variant (رنگ × ظرفیت)** با قیمت، تخفیف، موجودی و زمان ارسال مستقل برای هر Variant
- **موجودی دقیق** با رزرو هنگام سفارش و جلوگیری قطعی از Overselling، حتی در خریدهای هم‌زمان
- پرداخت نقدی آنلاین و **شش سرویس اقساطی** پشت یک Interface واحد
- ورود فقط با **شماره موبایل + OTP**، بدون ایمیل و پسورد، برای کاربر و ادمین
- پنل مدیریت با کنترل دسترسی نقش‌محور (RBAC) و Audit log

## ۲. استک

| لایه                               | تکنولوژی                                                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Frontend                           | Next.js 16 (App Router)، React 19، TypeScript، Tailwind CSS 4، shadcn/ui (Radix)، TanStack Query، react-hook-form + Zod |
| Backend                            | NestJS 11، TypeScript، REST، Swagger/OpenAPI                                                                            |
| Database                           | PostgreSQL 16 + Prisma 6                                                                                                |
| Cache / Lock / Rate-limit / PubSub | Redis 7 (ioredis)                                                                                                       |
| Queue                              | BullMQ (ارسال پیامک و پیام ربات، انقضای رزرو، پاک‌سازی)                                                                 |
| Storage                            | S3-compatible (MinIO) با درایور جایگزین Local برای توسعه/تست، پردازش تصویر با sharp                                     |
| Validation                         | Zod (اسکیماهای مشترک بین وب و API در `packages/shared`)                                                                 |
| Tests                              | Jest + Supertest (Unit / Integration)، Playwright (E2E)                                                                 |
| Infra                              | Docker Compose (PostgreSQL، Redis، MinIO)                                                                               |

## ۳. ساختار مخزن

```
iphoneha/
├─ apps/
│  ├─ api/                 NestJS — همه منطق کسب‌وکار
│  │  ├─ prisma/           schema.prisma، migrations، seed
│  │  ├─ src/
│  │  │  ├─ common/        guards, pipes, filters, decorators, utils
│  │  │  ├─ infra/         prisma, redis, queue, config
│  │  │  └─ modules/       auth, users, products, variants, inventory, cart,
│  │  │                    orders, payments, shipping, discount, notification,
│  │  │                    storage, settings, audit, admin, health, realtime
│  │  └─ test/             integration tests
│  └─ web/                 Next.js — فروشگاه (/) و پنل مدیریت (/admin)
├─ packages/
│  └─ shared/              Zod schemas، enums، برچسب‌های فارسی، ابزار قیمت و تلفن
├─ e2e/                    Playwright
├─ docker/                 فایل‌های کمکی (init MinIO، نمونه nginx)
├─ docs/                   ARCHITECTURE.md، API.md
└─ docker-compose.yml
```

## ۴. توپولوژی اجرا

```
Browser ──► Next.js (SSR/RSC، :3000)
              │  /api/*   ──rewrite──►  NestJS API (:4000, prefix /api)
              │  /media/* ──rewrite──►  MinIO/S3 یا /api/media (درایور local)
              └─ SSR fetch مستقیم به API_INTERNAL_URL (با فوروارد کوکی)
NestJS ──► PostgreSQL · Redis · BullMQ workers (داخل همان پروسه، قابل جداسازی) · MinIO
```

- مرورگر همیشه با **همان دامنه** وب کار می‌کند، پس کوکی‌ها First-party و `SameSite=Lax` هستند.
- در Production، reverse proxy (nginx/Caddy) مسیر `/api` را مستقیم به API می‌فرستد.

## ۵. ماژول‌های بک‌اند

| ماژول                  | مسئولیت                                                                                                                                                                                                                |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **AuthModule**         | ارسال/تأیید OTP، Rate limit، ضد Brute force، Session امن، Logout، لیست و ابطال Sessionها، CSRF                                                                                                                         |
| **UsersModule**        | پروفایل، تکمیل اطلاعات اولیه، آدرس‌ها                                                                                                                                                                                  |
| **ProductsModule**     | کاتالوگ، جستجو (مدل/ظرفیت/رنگ)، فیلتر، مرتب‌سازی، صفحه‌بندی، کش                                                                                                                                                        |
| **VariantsModule**     | موجودیت مستقل Variant، SKU، قیمت، تخفیف، زمان ارسال                                                                                                                                                                    |
| **InventoryModule**    | Stock / Reserved / Available، رزرو، Commit، آزادسازی، تعدیل، لاگ حرکت موجودی                                                                                                                                           |
| **CartModule**         | سبد مهمان و کاربر، ادغام پس از ورود، اعتبارسنجی موجودی                                                                                                                                                                 |
| **OrdersModule**       | Checkout تراکنشی، Snapshot اقلام و آدرس، State machine وضعیت                                                                                                                                                           |
| **PaymentsModule**     | `PaymentProvider` interface، Registry، Adapterها، Callback idempotent، Mock gateway                                                                                                                                    |
| **ShippingModule**     | روش‌های ارسال و Calculatorهای قابل تعویض                                                                                                                                                                               |
| **DiscountModule**     | تخفیف‌ها و کدهای کوپن با محدودیت کل و هر کاربر                                                                                                                                                                         |
| **NotificationModule** | `SmsProvider` interface (Console، Kavenegar، ملی‌پیامک) از طریق صف؛ `AlertsService` برای هشدار به فروشگاه (درخواست قسطی تازه و سفارش پرداخت‌شده) با پیامک و ربات تلگرام یا بله، بدون نام و موبایل مشتری و با سقف ساعتی |
| **StorageModule**      | `StorageDriver` interface (S3/MinIO، Local) + پردازش تصویر                                                                                                                                                             |
| **AdminModule**        | APIهای پنل مدیریت، RBAC، داشبورد، ثبت سفارش تلفنی و حضوری (`ManualOrdersService`)، تغییر وضعیت گروهی                                                                                                                   |
| **DevicesModule**      | ثبت گوشی با IMEI (و سریال، قیمت خرید، تأمین‌کننده) هنگام ورود کالا، اتصال IMEI به ردیف سفارش، برگشت به انبار با لغو یا مرجوعی                                                                                          |
| **LedgerModule**       | «دفتر اقساط» فروش اقساطی خود فروشگاه با چک صیادی و سفته: قرارداد، جدول اقساط، چک‌ها (وضعیت: نزد فروشگاه، در بانک، وصول، برگشتی، عودت)، سفته‌ها، پرداخت‌ها با ابطال، و صف روزانهٔ پیامک یادآوری                         |
| **BackofficeModule**   | پروندهٔ مشتری و یادداشت‌ها، جدول قیمت با تغییر گروهی و تاریخچه، گزارش فروش و خروجی اکسل (xlsx بدون وابستگی)                                                                                                            |
| **AuditModule**        | ثبت تغییرات ادمین (before/after، IP، User-Agent)                                                                                                                                                                       |
| **SettingsModule**     | تنظیمات فروشگاه (key/value)، از جمله شرایط خرید با چک و سفته و کدهای سرچ کنسول و GA4                                                                                                                                   |
| **CreditModule**       | فرم «درخواست خرید با چک یا سفته» (تله برای ربات، درخواست تکراری، سقف ارسال) و صندوق پیگیری آن در پنل                                                                                                                   |
| **ContentModule**      | مجله: مقاله‌های Markdown، کاور، انتشار و ورودی نقشهٔ سایت                                                                                                                                                              |
| **FeedsModule**        | وب‌سرویس محصولات برای ترب (API v3) و ایمالز                                                                                                                                                                            |
| **RealtimeModule**     | SSE برای تغییرات لحظه‌ای موجودی/قیمت Variantها (Redis Pub/Sub)                                                                                                                                                         |
| **HealthModule**       | سلامت DB و Redis                                                                                                                                                                                                       |

## ۶. جریان‌های کلیدی

### ۶.۱ ورود با OTP

1. `POST /api/auth/send-otp {phone}`: شماره به قالب `09xxxxxxxxx` نرمال می‌شود (ارقام فارسی و `+98` پشتیبانی می‌شوند).
   - محدودیت‌ها در Redis: هر ۶۰ ثانیه یک ارسال برای هر شماره، حداکثر ۵ ارسال در ساعت برای هر شماره، و ۲۰ ارسال در ساعت برای هر IP.
   - کد ۶ رقمی با `crypto.randomInt` ساخته می‌شود و فقط `HMAC-SHA256(secret, phone:purpose:code)` ذخیره می‌شود. انقضا ۱۲۰ ثانیه است.
   - ارسال پیامک از طریق صف BullMQ انجام می‌شود.
2. `POST /api/auth/verify-otp {phone, code}`:
   - هر کد حداکثر ۵ تلاش دارد، مقایسه constant-time است، و هر شماره+IP حداکثر ۱۰ تلاش در ۱۵ دقیقه دارد (در غیر این صورت قفل می‌شود).
   - کد مصرف‌شده باطل می‌شود. کاربر با `phone` یکتا upsert و `lastLoginAt` ثبت می‌شود.
   - یک Session ساخته می‌شود: توکن تصادفی ۳۲ بایتی در کوکی `HttpOnly; SameSite=Lax; Secure` و فقط `SHA-256` آن در DB. سبد مهمان در سبد کاربر ادغام می‌شود.
   - اگر نام کاربر خالی باشد، پاسخ `needsProfile: true` برمی‌گردد و کاربر به صفحه تکمیل اطلاعات می‌رود.
3. `POST /api/auth/logout` فقط Session جاری را باطل می‌کند. `GET/DELETE /api/auth/sessions` برای مدیریت دستگاه‌ها است.
4. ادمین همین جریان را با `purpose=ADMIN_LOGIN` روی `/api/admin/auth/*` طی می‌کند و فقط شماره‌های ثبت‌شده در `AdminUser` پذیرفته می‌شوند. Session ادمین جدا و کوتاه‌تر است (۱۲ ساعت).

### ۶.۲ انتخاب Variant

صفحه محصول ماتریس همه Variantهای فعال را می‌گیرد. ترتیب انتخاب: **رنگ ← ظرفیت**.

- رنگی که هیچ Variant فعال و موجود ندارد، غیرفعال نمایش داده می‌شود.
- پس از انتخاب رنگ، ظرفیت‌هایی که برای آن رنگ Variant موجود ندارند غیرقابل‌انتخاب‌اند.
- با هر انتخاب، قیمت، قیمت قبلی، درصد تخفیف، موجودی (`موجود` / `فقط N عدد` / `ناموجود`)، زمان ارسال و SKU فوراً عوض می‌شوند.
- موجودی لحظه‌ای با `GET /api/products/:id/variants` (بدون کش) و SSE تازه می‌شود. دکمه خرید برای Variant ناموجود غیرفعال است.

### ۶.۳ سبد خرید

- سبد مهمان با کوکی `ih_cart` (توکن تصادفی) و سبد کاربر با `userId` یکتا نگه داشته می‌شود. پس از ورود ادغام می‌شوند؛ جمع تعداد با سقف موجودی و سقف هر قلم محدود می‌شود.
- هر افزودن یا تغییر تعداد با `availableStock` و `MAX_QTY_PER_ITEM` سنجیده می‌شود.
- جمع‌ها همیشه سمت سرور محاسبه می‌شوند:
  - `subtotal = Σ(compareAt ?? price) × qty`
  - `discount = Σ(compareAt − price) × qty + تخفیف کوپن`
  - `total = subtotal − discount + shipping`

### ۶.۴ Checkout و رزرو موجودی (قلب سیستم)

`POST /api/checkout` با هدر اجباری `Idempotency-Key`:

1. **قفل کاربر:** `SET lock:checkout:{userId} NX PX 15000` در Redis. درخواست هم‌زمان همان کاربر 409 می‌گیرد.
2. **Idempotency:** اگر رکورد `(userId, key)` وجود داشته باشد، همان پاسخ قبلی برمی‌گردد. سفارش تکراری ساخته نمی‌شود و `@@unique([userId, idempotencyKey])` روی Order هم این را تضمین می‌کند.
3. **اعتبارسنجی مجدد** سبد، قیمت‌ها، وضعیت فعال محصول/Variant، کوپن و روش ارسال با قیمت‌های DB (به عدد کلاینت اعتماد نمی‌شود).
4. **تراکنش DB:**
   - ساخت Order با `orderNumber` از sequence (`IH100001`)، Snapshot آدرس، روش ارسال و اقلام. Snapshot اقلام شامل نام، رنگ، ظرفیت، SKU، قیمت، تخفیف و زمان ارسال همان لحظه است.
   - برای هر قلم (مرتب‌شده بر اساس variantId برای جلوگیری از deadlock):
     ```sql
     UPDATE "Inventory" SET reserved = reserved + $q
     WHERE "variantId" = $v AND stock - reserved >= $q
     RETURNING stock, reserved;
     ```
     اگر هیچ ردیفی برنگردد، موجودی کافی نیست و کل تراکنش rollback می‌شود (409). چون UPDATE روی ردیف قفل ردیفی می‌گیرد، دو خرید هم‌زمان آخرین واحد را نمی‌توانند هر دو بگیرند. `CHECK (reserved <= stock AND stock >= 0 AND reserved >= 0)` لایه دوم محافظت در خود DB است.
   - ثبت `InventoryReservation (ACTIVE, expiresAt)`، `InventoryMovement(RESERVE)`، مصرف کوپن با شرط سقف، ساخت Payment و خالی کردن سبد.
5. **بعد از commit:** Job تأخیری `expire-order` در BullMQ (jobId = orderId) برای پایان مهلت رزرو (پیش‌فرض ۱۵ دقیقه) زمان‌بندی می‌شود.
6. **ایجاد پرداخت نزد Provider:** سفارش `PAYMENT_PENDING` می‌شود و `redirectUrl` برمی‌گردد.

### ۶.۵ پرداخت

```ts
interface PaymentProvider {
  method: PaymentMethod;
  code: string;
  kind: 'ONLINE' | 'INSTALLMENT';
  checkEligibility(input): Promise<Eligibility>;
  createPayment(input): Promise<CreatePaymentResult>; // redirectUrl (یا redirectForm) + providerRef
  verifyPayment(input): Promise<VerifyPaymentResult>; // SUCCESS | FAILED | PENDING
  refundPayment(input): Promise<RefundPaymentResult>;
  getPaymentStatus(input): Promise<PaymentStatusResult>;
}
```

- **Adapterها:** `OnlinePaymentProvider` (درایورهای `zarinpal` و `mock`)، `SnapPayProvider`، `TaraProvider`، `DigipayProvider`، `NesibaProvider`، `BojetProvider`، `AzkiVamProvider`.
- هر Adapter اقساطی یک `InstallmentGatewayClient` می‌گیرد: `MockInstallmentClient` یا کلاینت واقعی سرویس در `providers/installment/live/`:
  - **`SnappPayClient`:** ورود OAuth با grant از نوع password و هدر Basic از `client_id` و `client_secret`. مبلغ به ریال است و موبایل با `+98`. قبل از هر تصمیم وضعیت را می‌پرسد: `PENDING` → `verify` → `settle`، و `VERIFY` → `settle`. اگر `settle` شکست بخورد مهم نیست، چون اسنپ‌پی شبانه خودش تسویه می‌کند. پیش از نمایش هم `eligible` را می‌پرسد، چون اسنپ‌پی می‌خواهد وقتی «نه» گفت پنهان شود.
  - **`DigipayClient`:** UPG با تیکت `type=11` و `basketDetailsDto`. `verify` با کد پیگیری callback انجام می‌شود و جواب فقط وقتی پذیرفته می‌شود که همان `providerId` و همان مبلغ را برگرداند. callback در `meta.callback` نگه داشته می‌شود تا صفحهٔ نتیجه یا reconcile بعداً تمامش کنند، چون دیجی‌پی API استعلام ندارد. خرید اعتباری (۵ و ۱۳) با وضعیت «تحویل شد» در پنل `purchases/deliver` می‌شود.
  - **`AzkiVamClient`:** هر درخواست با امضای `Signature` است: AES-256-CBC با IV صفر روی `subUrl#unixSeconds#POST#apiKey`. تصمیم با `status` تیکت است: ۸ یعنی `verify` و ۲، ۶ و ۹ یعنی گرفته‌شده.
  - **`TaraClient`:** ورود با `POST /api/v2/authenticate` (نام کاربری و رمز پنل پذیرندگی) و توکن Bearer که تا انقضا نگه داشته می‌شود و با ۴۰۱ تازه می‌شود. `getToken` مبلغ را به ریال، موبایل مشتری، `serviceAmountList` با «کد درگاه» و فاکتور آیتمی (`taraInvoiceItemList`؛ گوشی‌ها در گروه کالای `TARA_GROUP_CODE`، ارسال در گروه ۴۰) می‌فرستد؛ فاکتوری که با مبلغ نخواند یک سطر برای کل سفارش می‌شود. تارا لینک ندارد: مشتری با **فرم POST** `{username, token}` به `/api/ipgPurchase` می‌رود، پس کلاینت `redirectForm` برمی‌گرداند و `PaymentsService` مشتری را به صفحهٔ پل `GET /api/payments/go/:paymentId` می‌فرستد که همان فرم را خودکار ارسال می‌کند. تارا با POST `{token, result, channelRefNumber, traceNumber}` برمی‌گرداند؛ فقط callback توکن خودمان شمرده می‌شود، `result 0` با `purchaseVerify` (که باید `result 0`، `rrn` و همان مبلغ را بدهد) تأیید می‌شود و غیر از آن پرداخت ناموفق است. تارا استعلام ندارد، پس callback در `meta.callback` می‌ماند تا صفحهٔ نتیجه بعداً تمامش کند؛ برگشت وجه هم API ندارد و `MANUAL` است.
  - **`BajetClient`:** JETPAY نسخهٔ ۱.۳.۲: توکن با `username`، `password` و `terminalId`؛ `order` با مبلغ ریالی، موبایل و `returnUrl` که `referenceId` و `referUrl` (GET) می‌دهد. بازگشت مشتری فقط نشانه است: تصمیم با `inquiry` روی همان `referenceId` ذخیره‌شده است (شناسه، سفارش و مبلغ باید بخواند)، `SUCCESS` با `verify` گرفته می‌شود که باید `creditAmount + cashAmount` برابر مبلغ بدهد و **باید تا ۱۵ دقیقه** انجام شود وگرنه باجت خودش برمی‌گرداند؛ `VERIFIED` یعنی قبلاً گرفته شده، `FAILED/REVERSE/REFUND` یعنی ناموفق. برگشت وجه در این نسخه API ندارد و `MANUAL` است.
  - **نسیبا:** API عمومی برای فروشگاه‌ها منتشر نشده (مستند با قرارداد پذیرندگی می‌آید)، پس فقط `MockInstallmentClient` دارد و در production ارائه نمی‌شود.
- **`live/factory.ts`** تنها جایی است که env به کلاینت تبدیل می‌شود. Registry و `deploy/installment-check.cjs` هر دو از آن استفاده می‌کنند، پس بررسی روی سرور دقیقاً با همان تنظیمات فروشگاه انجام می‌شود. `probe()` هر کلاینت یک درخواست بی‌خطر است: استعلام، ورود (تارا فهرست گروه‌های کالای قرارداد را هم می‌آورد) یا وضعیت یک تیکت ساختگی.
- **درایورها:** `mock`، `live` و `sandbox` (محیط تست سرویس).
  - `missingLiveKeys` هر سرویسی را که کلیدش ناقص است، آدرسش `https` نیست یا با درایور `live` به یک میزبان تست (staging، sandbox، uat، test، dev) اشاره می‌کند، از دسترس خارج می‌کند. تارا و باجت محیط تست عمومی ندارند (`INSTALLMENT_HOSTS[...].sandbox = null`): `sandbox` آن‌ها بدون آدرس تستی که خود سرویس داده (`TARA_BASE_URL` / `BAJET_BASE_URL`) ناقص شمرده می‌شود. هیچ‌کدام از این‌ها API را از کار نمی‌اندازد.
  - `sandbox` در production در `staffOnlyPaymentMethods` است: ثبت می‌شود و کار می‌کند، ولی در `unavailablePaymentMethods` هم هست. پس storefront (ماشین‌حساب، استوری، فوتر) و `/payments/methods` هرگز آن را نشان نمی‌دهند.
  - فقط `options` و `assertEnabled` با `Buyer` کارکنان (حساب مشتری با موبایل یک مدیر فعال) آن را با برچسب «(آزمایشی)» می‌پذیرند. کد Provider هم `…-sandbox` می‌شود.
- **پنل:** `GET /api/admin/payment-connections` وضعیت اتصال هر روش را برمی‌گرداند: `LIVE`، `TEST`، `MOCK`، `INCOMPLETE` یا `OFF`، همراه با نام کلیدهای ناقص و هرگز خود کلیدها. این وضعیت در تنظیمات ← پرداخت کنار هر روش نمایش داده می‌شود.
- **Mock gateway:** صفحه `/api/payments/mock/:provider/:token` است که «پرداخت موفق / ناموفق / انصراف» دارد و مثل درگاه واقعی به Callback برمی‌گردد.
- **Callback:** `GET|POST /api/payments/callback/:provider/:paymentId` هرگز به پارامترهای برگشتی اعتماد نمی‌کند و همیشه `verifyPayment` سمت سرور را صدا می‌زند. سپس کاربر را به `/checkout/result` برمی‌گرداند.
- **صفحهٔ پل:** `GET /api/payments/go/:paymentId` برای درگاهی که با فرم POST وارد می‌شود (تارا): فرم ذخیره‌شده در `meta.redirectForm` را (فقط اکشن `https://` و فیلدهای متنی) رندر و خودکار ارسال می‌کند؛ بعد از پایان یا انقضای پرداخت ۴۱۰ می‌دهد. `CreatePaymentContext.customerIp` هم از همان درخواست تسویه می‌آید و به سرویسی که کنترل تقلب خودش را دارد (تارا) داده می‌شود.
- **Idempotency پرداخت:**
  - گذار وضعیت با UPDATE شرطی انجام می‌شود (`WHERE status IN ('INITIATED','PENDING')`)، پس فقط اولین Callback سفارش را `PAID` می‌کند و بقیه نتیجه موجود را برمی‌گردانند.
  - `@@unique([provider, providerRef])` روی Payment جلوی پرداخت تکراری را می‌گیرد.
  - `PaymentTransaction.idempotencyKey` یکتاست (مثلاً `verify:{paymentId}`).
- **موفق:** رزروها Commit می‌شوند (`stock −= q, reserved −= q, sold += q`) و سفارش `PAID` می‌شود.
- **ناموفق/انصراف:** رزرو آزاد، سفارش `CANCELLED (PAYMENT_FAILED)` و کوپن برگشت داده می‌شود.
- **پرداخت دیرهنگام** بعد از انقضای رزرو: اول تلاش برای رزرو و Commit مجدد انجام می‌شود. اگر موجودی نبود، Payment `REFUND_PENDING` می‌شود و `refundPayment` فراخوانی می‌شود.

### ۶.۶ انقضای رزرو

- Job تأخیری هر سفارش، پیش از لغو **وضعیت پرداخت را از Provider استعلام می‌کند** تا پرداختی که Callbackش نرسیده از دست نرود. اگر پرداخت انجام نشده بود: سفارش `CANCELLED (PAYMENT_TIMEOUT)`، رزرو آزاد و پرداخت `EXPIRED` می‌شود.
- یک Sweeper تکرارشونده (هر دقیقه) رزروهای منقضی جامانده را هم جمع می‌کند (برای مواقع از دست رفتن Job).
- همه آزادسازی‌ها با UPDATE شرطی روی `status='ACTIVE'` هستند، پس تکرار بی‌خطر است.

### ۶.۷ State machine سفارش

```
PENDING ─► PAYMENT_PENDING ─► PAID ─► PROCESSING ─► READY_TO_SHIP ─► SHIPPED ─► DELIVERED
   │              │             │           │               │  └──────────────────────► │ (تحویل حضوری)
   └──► CANCELLED ◄┘             ├─► CANCELLED (با بازپرداخت و برگشت به انبار)          └─► REFUNDED
                                 └─► REFUNDED
```

گذارها در `packages/shared` تعریف شده‌اند و هم API و هم پنل ادمین از همان جدول استفاده می‌کنند. هر تغییر در `OrderStatusHistory` ثبت می‌شود. با لغو یا مرجوعی، گوشی‌های IMEI‌دار سفارش برمی‌گردند (پیش از ارسال «در انبار»، بعد از ارسال «مرجوعی») و قرارداد اقساط آن سفارش «لغو» می‌شود.

### ۶.۸ فروش تلفنی و حضوری

`POST /admin/orders` (دسترسی `orders.create`) در یک تراکنش: مشتری را با موبایل پیدا یا می‌سازد، قیمت را از جدول قیمت می‌خواند (تخفیف فاکتور جداست)، موجودی را همان لحظه کم می‌کند (رزرو «COMMITTED» تا لغو و مرجوعی مثل سفارش سایت برگردد)، IMEIها را به ردیف‌ها وصل می‌کند و پرداخت را ثبت می‌کند: حضوری (نقد، کارتخوان، کارت‌به‌کارت) یا قرارداد اقساط چک/سفته که همان‌جا در دفتر اقساط نوشته می‌شود. پرداخت‌های دستی روش `IN_STORE`/`CHEQUE`/`SAFTE` و provider `manual` دارند؛ بازپرداختشان فقط ثبت می‌شود (پول دستی برمی‌گردد).

### ۶.۹ دفتر اقساط

قرارداد = پیش‌پرداخت + جدول اقساط (روز تقویم، `@db.Date`، «امروز» یعنی امروزِ تهران) + چک‌ها و سفته‌های تضمین. هر پول ورودی با قفل ردیف قرارداد (`SELECT … FOR UPDATE`) از قسط انتخابی و بعد قسط‌های باز بعدی کم می‌شود؛ مازاد پذیرفته نمی‌شود مگر از وصول چک (به‌عنوان بستانکاری ثبت می‌شود). وصول چک مبلغش را پای قسط خودش می‌نویسد؛ ابطال همهٔ ردیف‌های آن چک را با هم برمی‌گرداند و چک به «در بانک» برمی‌گردد. قرارداد با پرداخت یا بخشیدن همهٔ اقساط «تسویه» می‌شود. صف `ledger` هر روز ساعت ۱۰ تهران یادآوری می‌فرستد (چند روز پیش از سررسید و هر چند روز برای معوق، روزی یک بار)، فقط وقتی در تنظیمات روشن باشد و الگوی ملی‌پیامک آن روی سرور باشد.

## ۷. مدل داده

اسکیمای کامل در `apps/api/prisma/schema.prisma` است. نکات کلیدی:

- **پول:** همه مبالغ به **تومان** و از نوع `BigInt` در PostgreSQL هستند (برای جمع سفارش‌های بزرگ). در API به `number` تبدیل می‌شوند که تا ۲^۵۳ امن است.
- **Variant** موجودیت مستقل است و `@@unique([productId, colorId, storageId])` و `sku @unique` دارد. `discountPercent` هنگام نوشتن از `price` و `compareAtPrice` محاسبه و ذخیره می‌شود تا مرتب‌سازی «بیشترین تخفیف» در DB انجام شود.
- **Inventory** رابطه ۱:۱ با Variant دارد (`stock`، `reserved`، `sold`) و `available = stock − reserved`. CHECK constraint جلوی مقادیر نامعتبر را می‌گیرد.
- **Snapshotها:** `Order.shippingAddress`، `Order.shippingMethodSnapshot` و ستون‌های `OrderItem` در لحظه خرید کپی می‌شوند و تغییرات بعدی محصول روی سفارش قبلی اثر ندارد.
- **Session** برای کاربر و ادمین مشترک است (`kind`). CHECK constraint تضمین می‌کند دقیقاً یکی از `userId` یا `adminUserId` پر باشد.
- **جستجو:** ستون `Product.searchText` (نام فارسی/انگلیسی، سری، رنگ‌ها و ظرفیت‌ها) با ایندکس GIN `pg_trgm`.
- **ایندکس‌ها:** وضعیت و تاریخ سفارش، `userId`، قیمت و درصد تخفیف Variant، `status + expiresAt` رزرو، `entityType + entityId` در Audit log.

## ۸. امنیت

| مورد            | پیاده‌سازی                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| Rate limit OTP  | شمارنده‌های Redis برای هر شماره و IP + ThrottlerModule سراسری با storage ردیس       |
| Brute force OTP | ۵ تلاش برای هر کد، قفل ۱۵ دقیقه‌ای شماره+IP، مقایسه constant-time، کد هش‌شده        |
| Session         | توکن ۲۵۶ بیتی، ذخیره هش، کوکی HttpOnly/Secure/SameSite، انقضا و ابطال، کش Redis     |
| CSRF            | Double-submit cookie (`ih_csrf` + هدر `X-CSRF-Token`) برای متدهای تغییردهنده        |
| Validation      | Zod روی همه ورودی‌ها (Pipe سراسری)، محدودیت اندازه body                             |
| SQL Injection   | Prisma و `$queryRaw` با tagged template (پارامتری)                                  |
| XSS             | React escaping، بدون HTML خام از کاربر، JSON-LD با escape، هدر CSP                  |
| Secure headers  | helmet (HSTS، CSP، frameguard، noSniff، referrer-policy)                            |
| Audit           | Interceptor ثبت before/after همه تغییرات ادمین                                      |
| Permission      | `@RequirePermissions()` + نقش‌ها (`SUPER_ADMIN`، `MANAGER`، `SUPPORT`، `WAREHOUSE`) |
| Checkout        | تراکنش DB، UPDATE شرطی، CHECK constraint، قفل Redis، Idempotency-Key                |
| Payment         | Callback idempotent، unique `(provider, providerRef)`، تأیید سمت سرور، مبلغ از DB   |

## ۹. کش و کارایی

- **API:** کش Redis برای لیست و جزئیات محصول با کلید نسخه‌دار (`catalog:v`) که با هر تغییر محصول، قیمت یا موجودی افزایش پیدا می‌کند. موجودی لحظه‌ای از endpoint بدون کش خوانده می‌شود.
- **Web:**
  - Data Cache در Next.js (`revalidate` + tag) و invalidation از API به `/internal/revalidate`.
  - `next/image` با WebP/AVIF، lazy loading و فونت استعداد (Estedad) self-hosted (بدون وابستگی به Google Fonts).
- **DB:** ایندکس‌های مناسب، صفحه‌بندی همه لیست‌ها، کوئری کاتالوگ با `DISTINCT ON` در SQL.

## ۱۰. SEO

- URL محصول به شکل `/iphone/iphone-17-pro-max` است و `generateMetadata` عنوان SEO، Meta description، Open Graph و canonical را می‌سازد.
- JSON-LD از نوع `Product` (با `AggregateOffer`، موجودی و SKU) و `BreadcrumbList`.
- `sitemap.xml` و `robots.txt` پویا تولید می‌شوند.

## ۱۱. تست

| سطح         | ابزار                                     | پوشش                                                                                                                             |
| ----------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unit        | Jest                                      | قیمت و تخفیف، شماره موبایل، OTP، state machine، Calculator ارسال، کوپن، Providerها                                               |
| Integration | Jest + Supertest + PostgreSQL/Redis واقعی | ورود OTP، سبد، اعتبار موجودی، Checkout، پرداخت موفق/ناموفق، Callback تکراری، رزرو و آزادسازی، **Checkout هم‌زمان**، دسترسی ادمین |
| E2E         | Playwright                                | انتخاب Variant، افزودن به سبد، ورود، Checkout کامل با درگاه Mock، مسیر ناموفق، پنل ادمین                                         |

---

## ۱۲. پیاده‌سازی فرانت‌اند (آنچه ساخته شد)

معماری بالا در عمل به این شکل پیاده شد؛ تفاوت‌ها و تصمیم‌های اجرایی اینجا ثبت شده‌اند.

### ۱۲.۱ ساختار مسیرها

| مسیر                                   | رندر                        | توضیح                                                                                                                                                                                            |
| -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/`                                    | ISR (۶۰ ثانیه)              | **استوری‌های خرید قسطی**، بنر هیرو، دسته‌بندی مدل‌ها، پرفروش‌ها، بخش اقساط، تخفیف‌ها، **جدول مقایسهٔ مدل‌ها**، چک و سفته، **امتیاز خریداران**، **کارت‌های راهنما**، **نوار آمار**، سؤالات متداول |
| `/shop`                                | SSR با `searchParams`       | فیلتر (مدل، حافظه، رنگ، قیمت، موجودی، تخفیف)، مرتب‌سازی، صفحه‌بندی                                                                                                                               |
| `/iphone/[slug]`                       | SSG + `revalidate` ۳۰ ثانیه | انتخاب رنگ→حافظه، JSON-LD، محصولات مشابه                                                                                                                                                         |
| `/cart` `/checkout` `/checkout/result` | کلاینت/SSR                  | سبد، تسویه هفت‌مرحله‌ای، نتیجه پرداخت                                                                                                                                                            |
| `/login`                               | استاتیک                     | ورود با OTP (سه مرحله: شماره → کد → تکمیل نام)                                                                                                                                                   |
| `/account/**`                          | SSR (کوکی)                  | پروفایل، سفارش‌ها، آدرس‌ها، دستگاه‌های فعال                                                                                                                                                      |
| `/wishlist`                            | استاتیک + کلاینت            | علاقه‌مندی‌های ذخیره‌شده در مرورگر (بدون نیاز به حساب)                                                                                                                                           |
| `/installments` `/guide`               | ISR                         | شرایط سرویس‌ها + محاسبه‌گر، راهنمای خرید                                                                                                                                                         |
| `/admin/**`                            | SSR با نشست مدیر            | داشبورد، محصولات، انبار، سفارش‌ها، پرداخت‌ها، تخفیف‌ها، ارسال، کاربران، گزارش فعالیت، تنظیمات                                                                                                    |

### ۱۲.۲ تصمیم‌های اجرایی

- **یک endpoint برای صفحه اصلی.** ماژول `storefront` در API همهٔ دادهٔ صفحه اصلی (بنرها با تصویر همان رنگ، دسته‌بندی‌ها، پرفروش‌ها، تخفیف‌دارها و آمار) را در یک پاسخ کش‌شده می‌دهد؛ کلید کش هم نسخهٔ کاتالوگ و هم نسخهٔ تنظیمات را در بر می‌گیرد.
- **استوری‌ها روی سرور ساخته می‌شوند، نمایشگرشان تنبل است.** `lib/stories.ts` از همان تنظیمات صفحه‌های اقساط (پلن‌های چک و سفته، `config.installments`، هیرو و مقاله‌های تازه) گروه‌ها را می‌سازد؛ پس استوری سرویسی که در تسویه نیست ساخته نمی‌شود و رقم «قسط ماهانه از» همان است که ماشین‌حساب با کمترین پیش‌پرداخت و بیشترین اقساط نشان می‌دهد. ردیف حلقه‌ها (`StoryBox`) در HTML سرور است؛ `StoryViewer` با `next/dynamic` و `ssr: false` فقط با باز شدن اولین استوری (یا نزدیک شدن نشانگر) بارگذاری می‌شود. «دیده‌شده» با امضای شناسهٔ گروه و اسلایدهایش در `localStorage` (`ih:stories:seen`) و `useSyncExternalStore` نگه داشته می‌شود تا استوری تازه‌شده دوباره رنگی شود. زمان هر اسلاید یک انیمیشن CSS است (`animate-progress` و `onAnimationEnd`) که با نگه‌داشتن، دکمهٔ توقف، پنهان شدن تب و بارگذاری نشدن بنر متوقف می‌ماند؛ با «حرکت کمتر» زمان‌سنجی در کار نیست، چون CSS سراسری مدت هر انیمیشن را ۰٫۰۱ میلی‌ثانیه می‌کند.
- **صفحهٔ محصول باید در HTML سرور باشد.** استفاده از `useSearchParams` کل درخت را به رندر کلاینتی می‌برد و نام و قیمت از HTML حذف می‌شد؛ به جای آن انتخاب اولیه از `defaultVariantId` می‌آید و `?color/?storage` پس از mount اعمال و با `history.replaceState` هم‌گام می‌شود.
- **وضعیت مشتق به جای effect.** انتخاب آدرس/روش ارسال/روش پرداخت در تسویه و همچنین اصلاح حافظه هنگام تغییر رنگ، به‌جای `useEffect` از مقدار مشتق یا «تنظیم state در حین رندر» استفاده می‌کنند (سازگار با قانون `react-hooks/set-state-in-effect` در Next 16).
- **موجودی زنده.** صفحهٔ محصول به `GET /api/products/:slug/stream` (SSE) وصل می‌شود و قیمت/موجودی هر ترکیب را بدون رفرش به‌روز می‌کند.
- **کارت محصول با انتخاب رنگ.** با اولین تغییر رنگ، جزئیات محصول (ترکیب‌ها و عکس هر رنگ) یک بار گرفته و کش می‌شود.
- **نمودار بدون کتابخانه.** نمودار فروش پنل با `div` ساده رسم شده تا حجم باندل پنل کم بماند.
- **جدول مقایسه از روی `specs` واقعی.** ردیف‌های «مقایسه مدل‌ها» از فیلد `specs` همان محصول‌ها ساخته می‌شود و فقط ردیف‌هایی می‌مانند که دست‌کم دو مدل آن را تعریف کرده‌اند؛ هیچ مشخصهٔ ساختگی‌ای در جدول نیست (`StorefrontService.compareTable`).
- **امتیازها واقعی‌اند.** میانگین امتیاز فروشگاه یک میانگین وزنی روی `ratingAvg`/`ratingCount` محصول‌های فعال است (`stats.ratingAvg`, `stats.ratingCount`) و ستاره‌ها با `formatDecimalFa` نمایش داده می‌شوند، چون `formatNumberFa` عدد را گرد می‌کرد و ۴.۸ را «۵» نشان می‌داد.
- **علاقه‌مندی‌ها فقط در مرورگر.** `use-wishlist` فهرست را در `localStorage` نگه می‌دارد (هر خواندن/نوشتن داخل `try/catch`) و با یک `CustomEvent` بین هدر، کارت‌ها و صفحهٔ `/wishlist` هم‌گام می‌شود؛ نه حسابی لازم است و نه چیزی به سرور می‌رود.
- **نوار خرید چسبان در موبایل.** در صفحهٔ محصول یک `IntersectionObserver` روی ردیف دکمه‌ها نصب است؛ وقتی دکمه‌ها از دید خارج شوند نوار قیمت + «افزودن به سبد» بالای نوار پایین ظاهر می‌شود (و در حالت پنهان `aria-hidden` و غیرقابل تمرکز است).
- **اسکلت هنگام تغییر فیلتر.** نتایج `/shop` داخل یک `<Suspense key={filters}>` رندر می‌شوند تا با هر تغییر فیلتر، به‌جای ماندن فهرست قبلی، اسکلت کارت‌ها دیده شود.
- **گروه‌های جمع‌شوندهٔ فیلتر.** هر گروه فیلتر یک `<details>` است (دسترس‌پذیری بومی) و شمارندهٔ انتخاب‌های فعال را نشان می‌دهد؛ فیلتر «سری» و «زمان ارسال» هم که API از قبل پشتیبانی می‌کرد به UI اضافه شد.
- **RTL و فونت.** کل اپ `dir="rtl"` است، از ویژگی‌های منطقی Tailwind (`ms/me/ps/pe/start/end`) استفاده می‌کند و فونت‌های استعداد (Estedad، مجوز OFL، برای متن فارسی) و Manrope (عدد و لاتین) به صورت محلی (`next/font/local`) سرو می‌شوند.

### ۱۲.۳ نکته‌های رفع‌شده حین تست

- کلید نسخه‌دار کش: نسخهٔ پیش‌فرض ۱ بود و اولین `INCR` هم ۱ می‌شد، پس اولین invalidate بی‌اثر بود (اکنون از ۰ شروع می‌شود).
- `initialData: null` در React Query دادهٔ تازه به حساب می‌آمد و درخواست `/users/me` هرگز ارسال نمی‌شد؛ کاربر واردشده در صفحهٔ تسویه «مهمان» دیده می‌شد.
- `nest build` با `deleteOutDir` و بیلد افزایشی گاهی `dist` ناقص می‌ساخت؛ اسکریپت build حالا `dist` و `tsbuildinfo` را پاک می‌کند.

---

## ۱۳. دسترس‌پذیری و یکپارچگی (CI)

- **پالت رنگ با کنتراست تضمین‌شده.** خاکستری‌های فایل طراحی (`#73777e`، `#8b8f96`، `#b3b7be`) روی سفید به ترتیب ۴.۵، ۳.۳ و ۲.۰ کنتراست داشتند؛ یعنی متن‌های کوچک از استاندارد WCAG AA رد می‌شدند. پالت به `#5f636a`، `#63676e` و `#6b6f76` تیره‌تر شد (۶.۰ / ۵.۷ / ۵.۱ روی سفید) و رنگ‌های وضعیت هم اصلاح شدند: قرمز `#c62b3c`، نارنجی `#9a5b00`، سبز `#0a6f4b`، آبی `#2360cf`. `#b3b7be` فقط به‌عنوان رنگ تزئینی (`--color-hairline-ink`) باقی ماند و هرگز برای متن استفاده نمی‌شود.
- **کنتراست نشان تخفیف.** واژهٔ «تخفیف» روی نشان قرمز کارت ابتدا با `text-white/85` بود (۴.۳۴:۱) و axe آن را رد کرد؛ اکنون سفید کامل است.
- **تست خودکار.** `e2e/tests/accessibility.spec.ts` با axe-core شش صفحهٔ فروشگاه و چهار صفحهٔ پنل را با قواعد `wcag2a/wcag2aa/wcag21a/wcag21aa` می‌سنجد و صفر خطا را شرط قبولی می‌گیرد؛ همچنین بررسی می‌کند که `lang="fa"` و `dir="rtl"` روی `html` باشد.
- **نمودار پنل** به‌جای `role="img"` (که کنترل‌های تمرکزپذیر داخلش قانون nested-interactive را می‌شکست) یک `role="group"` با برچسب است و هر ستون دکمه‌ای با `aria-label` شامل تاریخ و مبلغ.
- **CI.** `.github/workflows/ci.yml` روی هر push و PR: نصب با lockfile، ساخت پکیج مشترک، مهاجرت و seed روی PostgreSQL و Redis سرویس‌محور، سپس lint، typecheck، تست واحد، تست یکپارچه و build؛ و در مرحلهٔ دوم، اجرای کامل Playwright با آپلود گزارش در صورت شکست.

---

## ۱۴. پوشش پنل مدیریت نسبت به API

هر مسیر نوشتنیِ API در پنل یک نقطهٔ ورود دارد؛ جدول زیر نگاشت نهایی است:

| بخش            | خواندن                                                                          | نوشتن از پنل                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| داشبورد        | `GET /admin/dashboard` (با خلاصهٔ دفتر اقساط برای دارندگان `installments.read`) | —                                                                                                                                                       |
| سفارش‌ها       | list (فیلتر وضعیت، منبع، روش پرداخت، بازهٔ تاریخ شمسی، جست‌وجوی IMEI) + detail  | ثبت سفارش تلفنی/حضوری، تغییر وضعیت (تکی و گروهی)، کد رهگیری، یادداشت داخلی، IMEI، فاکتور و برچسب چاپی                                                   |
| دفتر اقساط     | سررسیدها، چک‌ها، قراردادها، خلاصه                                               | قرارداد تازه (از درخواست سایت یا دستی)، پرداخت و ابطال، ویرایش/بخشیدن قسط، یادآوری پیامکی، چک و سفتهٔ تازه و تغییر وضعیتشان، وضعیت قرارداد، چاپ قرارداد |
| گوشی‌ها (IMEI) | list + lookup                                                                   | ورود کالا با IMEI (افزایش موجودی)، معیوب/مرجوعی، قیمت خرید، حذف ثبت اشتباه                                                                              |
| قیمت‌ها        | جدول همهٔ ترکیب‌ها + تاریخچه                                                    | ویرایش درجا، تغییر گروهی درصدی/مبلغی/ثابت با پیش‌نمایش                                                                                                  |
| گزارش فروش     | بازهٔ تاریخ، تفکیک مدل/حافظه/رنگ/روش پرداخت/منبع/استان                          | خروجی اکسل سفارش‌ها، مشتری‌ها، اقساط، چک‌ها، IMEIها و گزارش                                                                                             |
| پروندهٔ مشتری  | سفارش‌ها، قراردادها، درخواست‌ها، نشانی‌ها                                       | یادداشت داخلی                                                                                                                                           |
| محصولات        | list + detail                                                                   | ساخت، ویرایش (نام، شعار، توضیح، سئو، فعال/ویژه، **مشخصات فنی**)، حذف                                                                                    |
| ترکیب‌ها       | داخل صفحهٔ محصول                                                                | افزودن، ویرایش قیمت/تخفیف/ارسال/وضعیت، حذف                                                                                                              |
| تصاویر         | داخل صفحهٔ محصول                                                                | آپلود (multipart) و حذف                                                                                                                                 |
| رنگ و حافظه    | `GET /admin/colors                                                              | storages`                                                                                                                                               | ساخت و ویرایش هر دو |
| انبار          | list + low-stock + movements                                                    | تنظیم/افزایش/کاهش موجودی با دلیل                                                                                                                        |
| پرداخت‌ها      | list + **transactions**                                                         | بازگشت وجه                                                                                                                                              |
| تخفیف‌ها       | discounts + coupons                                                             | ساخت، ویرایش، فعال/غیرفعال، حذف تخفیف                                                                                                                   |
| ارسال          | list                                                                            | ساخت، ویرایش، حذف                                                                                                                                       |
| کاربران        | مشتری‌ها + مدیران                                                               | مسدودسازی مشتری، افزودن/ویرایش مدیر                                                                                                                     |
| تنظیمات        | همهٔ کلیدها                                                                     | فروشگاه، بنرهای صفحه اصلی، پرداخت، سبد، دفتر اقساط (یادآوری و بندهای قرارداد)                                                                           |
| گزارش فعالیت   | list                                                                            | — (فقط خواندنی، طبق طراحی)                                                                                                                              |

تنها مسیرهایی که عمداً UI ندارند: `GET /admin/variants` (همان دادهٔ صفحهٔ انبار است) و فیلتر `entityType` روی گزارش فعالیت که فعلاً فقط از طریق query string در دسترس است.

دسترسی‌های تازه: `orders.create` (ثبت سفارش دستی)، `installments.read` / `installments.write`، `reports.read` (گزارش و اکسل، که اطلاعات مشتری دارد) و `users.notes`. پشتیبانی (SUPPORT) دفتر اقساط را می‌خواند و یادداشت می‌گذارد؛ مدیر فروشگاه (MANAGER) همه را دارد جز مدیریت مدیران.
