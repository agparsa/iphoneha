import type { Metadata } from 'next';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { LEGAL_UPDATED_AT, LegalPage, type LegalSection } from '@/components/store/legal-page';
import { telHref } from '@/lib/utils';

export const metadata: Metadata = {
  title: 'حریم خصوصی',
  description:
    'آیفونی‌ها چه اطلاعاتی از شما نگه می‌دارد، برای چه استفاده می‌کند و با چه کسی به اشتراک می‌گذارد.',
  alternates: { canonical: '/privacy' },
};

export const revalidate = 300;

/**
 * Written from what the code actually does: OTP-only login, no stored card
 * data, the wishlist in the visitor's own browser, no advertising trackers,
 * and Google Analytics only while the owner has turned it on in the admin.
 * Update it with the code.
 */
export default async function PrivacyPage() {
  const { store, seo } = await getStorefrontConfig();
  const analytics = Boolean(seo?.ga4MeasurementId);

  const sections: LegalSection[] = [
    {
      id: 'collected',
      title: 'چه اطلاعاتی نگه می‌داریم',
      body: (
        <ul className="list-disc space-y-2 ps-5">
          <li>شمارهٔ موبایل، برای ورود به حساب و اطلاع‌رسانی سفارش.</li>
          <li>نام، نام خانوادگی و آدرس‌هایی که برای ارسال سفارش وارد می‌کنید.</li>
          <li>سفارش‌ها، وضعیت پرداخت و کد رهگیری ارسال.</li>
          <li>
            اگر فرم «خرید اقساطی با چک یا سفته» را پر کنید: نام، شمارهٔ موبایل، شهر، مدل و روش پرداختی که
            انتخاب کرده‌اید، فقط برای اینکه کارشناس فروش با شما تماس بگیرد و قرارداد را هماهنگ کند.
          </li>
          <li>
            اطلاعات فنی لازم برای امنیت حساب، مانند زمان ورود و نوع مرورگر هر نشست، تا بتوانید نشست‌های فعال
            خود را ببینید و ببندید.
          </li>
        </ul>
      ),
    },
    {
      id: 'not-collected',
      title: 'چه اطلاعاتی نگه نمی‌داریم',
      body: (
        <>
          <p>
            اطلاعات کارت بانکی فقط در صفحهٔ درگاه پرداخت وارد می‌شود و به این سایت نمی‌رسد. رمز عبوری هم وجود
            ندارد؛ ورود فقط با کد یک‌بارمصرف پیامکی انجام می‌شود.
          </p>
          <p>
            {analytics
              ? 'سایت ابزار ردیابی تبلیغاتی ندارد. برای شناخت بهتر بازدیدها از Google Analytics استفاده می‌شود که در بخش کوکی‌ها توضیح داده شده است.'
              : 'سایت هیچ ابزار ردیابی تبلیغاتی یا آمارگیری شخص ثالث ندارد.'}
          </p>
        </>
      ),
    },
    {
      id: 'use',
      title: 'اطلاعات برای چه استفاده می‌شود',
      body: (
        <p>
          فقط برای پردازش و ارسال سفارش، پاسخ به درخواست خرید اقساطی، پشتیبانی، ارسال پیامک کد ورود و
          اطلاع‌رسانی وضعیت سفارش، و جلوگیری از سوءاستفاده و تقلب. پیامک تبلیغاتی بدون اجازهٔ شما ارسال
          نمی‌شود.
        </p>
      ),
    },
    {
      id: 'sharing',
      title: 'اشتراک‌گذاری با دیگران',
      body: (
        <>
          <p>اطلاعات شما فروخته نمی‌شود و فقط به اندازهٔ لازم در اختیار این طرف‌ها قرار می‌گیرد:</p>
          <ul className="list-disc space-y-2 ps-5">
            <li>شرکت حمل‌ونقل: نام، شماره تماس و آدرس تحویل‌گیرنده.</li>
            <li>درگاه پرداخت: مبلغ و شمارهٔ سفارش، و در صورت نیاز شمارهٔ موبایل پرداخت‌کننده.</li>
            <li>سرویس ارسال پیامک: شمارهٔ موبایل و متن پیامک.</li>
            {analytics ? (
              <li>
                Google Analytics: صفحه‌های بازدیدشده، نوع دستگاه و مرورگر و کالاهای دیده‌شده یا خریداری‌شده؛
                بدون نام، شماره یا آدرس شما.
              </li>
            ) : null}
            <li>مراجع قانونی، فقط در صورت درخواست رسمی و مطابق قانون.</li>
          </ul>
        </>
      ),
    },
    {
      id: 'cookies',
      title: 'کوکی‌ها و ذخیره در مرورگر',
      body: (
        <>
          <p>
            {analytics ? 'کوکی‌های ضروری سایت' : 'سایت فقط کوکی‌های ضروری خودش را به کار می‌برد'}: کوکی نشست
            برای ورود به حساب، کوکی امنیتی برای جلوگیری از درخواست‌های جعلی و کوکی سبد خرید مهمان.
          </p>
          {analytics ? (
            <p>
              کوکی‌های آمار: Google Analytics با کوکی‌هایی مثل <span className="font-display">_ga</span> تعداد
              بازدیدکنندگان و مسیر بازدید را می‌شمارد. با مسدود کردن کوکی‌ها یا افزونه‌های ضدردیابی مرورگر
              می‌توانید جلوی آن را بگیرید؛ خرید از سایت به این کوکی‌ها وابسته نیست.
            </p>
          ) : null}
          <p>
            فهرست علاقه‌مندی‌ها فقط در حافظهٔ همان مرورگر شما ذخیره می‌شود و به سرور ارسال نمی‌شود؛ با پاک
            کردن اطلاعات مرورگر از بین می‌رود.
          </p>
        </>
      ),
    },
    {
      id: 'security',
      title: 'امنیت اطلاعات',
      body: (
        <p>
          ارتباط با سایت رمزنگاری‌شده (HTTPS) است، کدهای ورود کوتاه‌مدت و محدود به چند تلاش‌اند و دسترسی
          کارکنان به پنل مدیریت بر اساس نقش محدود و همهٔ تغییرات آن ثبت می‌شود.
        </p>
      ),
    },
    {
      id: 'rights',
      title: 'نگهداری اطلاعات و حقوق شما',
      body: (
        <>
          <p>
            نام، آدرس‌ها و نشست‌های فعال خود را هر زمان می‌توانید از بخش حساب کاربری ببینید، ویرایش یا حذف
            کنید.
          </p>
          <p>
            برای حذف کامل حساب با پشتیبانی تماس بگیرید. سوابق سفارش و فاکتورها تا مدتی که قوانین مالیاتی و
            تجاری الزام می‌کنند نگه داشته می‌شود.
          </p>
        </>
      ),
    },
    {
      id: 'contact',
      title: 'پرسش دربارهٔ حریم خصوصی',
      body: (
        <p>
          با{' '}
          <a href={telHref(store.phone)} className="text-ink underline underline-offset-4">
            {store.phone}
          </a>
          {store.email ? (
            <>
              {' '}
              یا{' '}
              <a
                href={`mailto:${store.email}`}
                className="font-display text-ink underline underline-offset-4"
              >
                {store.email}
              </a>
            </>
          ) : null}{' '}
          تماس بگیرید.
        </p>
      ),
    },
  ];

  return (
    <LegalPage
      eyebrow="Privacy"
      title="حریم خصوصی"
      path="/privacy"
      updatedAt={LEGAL_UPDATED_AT}
      intro={<p>{store.name} فقط اطلاعاتی را نگه می‌دارد که برای رساندن سفارش شما لازم است.</p>}
      sections={sections}
    />
  );
}
