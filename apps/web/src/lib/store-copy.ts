import { PAYMENT_METHOD_INFO, formatNumberFa, type StorefrontConfigDto } from '@iphoneha/shared';

/**
 * Every customer-facing promise that depends on how the store is actually
 * run — warranty, returns, which instalment services exist — is written here
 * from the live settings, never hardcoded. Change a number in the admin panel
 * and the storefront, the FAQ and the structured data all say the same thing.
 */

export interface FaqItem {
  q: string;
  a: string;
}

type Config = Pick<StorefrontConfigDto, 'store' | 'installments'>;

/** «اسنپ‌پی، تارا و دیجی‌پی» */
export function installmentServiceNames(config: Pick<StorefrontConfigDto, 'installments'>): string {
  const names = config.installments.map((term) => PAYMENT_METHOD_INFO[term.method].name);
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join('، ')} و ${names.at(-1)}`;
}

export function warrantySentence(config: Config): string | null {
  const months = config.store.warrantyMonths;
  if (months <= 0) return null;
  return `هر دستگاه با گارانتی ${formatNumberFa(months)} ماهه ${config.store.name} عرضه می‌شود؛ ایرادهای سخت‌افزاری غیرناشی از ضربه، نفوذ مایعات یا تعمیر غیرمجاز در این بازه پوشش داده می‌شود.`;
}

export function returnsSentence(config: Config): string {
  const days = config.store.returnDays;
  if (days <= 0) {
    return 'بازگشت کالا فقط در صورت ایراد فنی یا مغایرت با سفارش و پس از کارشناسی انجام می‌شود.';
  }
  return `تا ${formatNumberFa(days)} روز پس از تحویل، در صورت پلمپ و سالم بودن دستگاه، امکان بازگشت کالا وجود دارد. برای دستگاه باز شده، بازگشت بر اساس کارشناسی و قوانین فروشگاه انجام می‌شود.`;
}

export function chequeSentence(): string {
  // checkout has no cheque option: this purchase starts with a request or a call, not an order
  return 'برای خرید با چک صیادی یا سفته، مدل و حافظهٔ دلخواهت را انتخاب کن و فرم درخواست خرید قسطی را بفرست یا با پشتیبانی تماس بگیر. کارشناس ما استعلام چک را انجام می‌دهد و پیش‌پرداخت و جدول اقساط در قرارداد رسمی نوشته می‌شود؛ همه غیرحضوری.';
}

export function purchaseFaq(config: Config): FaqItem[] {
  const hasServices = config.installments.length > 0;
  const warranty = config.store.warrantyMonths;

  return [
    ...(hasServices
      ? [
          {
            q: 'خرید قسطی چطور انجام می‌شود؟',
            a: `مدل و حافظه را انتخاب می‌کنی، در مرحله پرداخت یکی از سرویس‌های اعتباری (${installmentServiceNames(config)}) را می‌زنی و به درگاه همان سرویس منتقل می‌شوی. پس از اعتبارسنجی و تأیید، سفارش نهایی و برای ارسال آماده می‌شود.`,
          },
          {
            q: 'برای اعتبارسنجی چه مدارکی لازم است؟',
            a: 'حداقل کارت ملی و احراز هویت آنلاین. بعضی سرویس‌ها فیش حقوقی یا شماره شبا هم می‌خواهند؛ شرایط هر سرویس در صفحه خرید قسطی آمده است.',
          },
        ]
      : []),
    {
      q: 'گوشی‌ها آکبند و اصل هستند؟',
      a:
        warranty > 0
          ? `بله. همه دستگاه‌ها آکبند، پلمپ و اصل‌اند، با ضمانت اصالت کالا و گارانتی ${formatNumberFa(warranty)} ماهه ${config.store.name}.`
          : 'بله. همه دستگاه‌ها آکبند، پلمپ و اصل‌اند و با ضمانت اصالت کالا عرضه می‌شوند.',
    },
    { q: 'اگر منصرف شوم می‌توانم مرجوع کنم؟', a: returnsSentence(config) },
    {
      q: 'ارسال چقدر طول می‌کشد؟',
      a: 'روش‌های ارسال، هزینه و زمان تقریبی تحویل هر کدام پیش از پرداخت در مرحلهٔ تسویه نمایش داده می‌شود. زمان آماده‌سازی هر کالا هم روی صفحهٔ همان کالا آمده است.',
    },
    { q: 'امکان خرید با چک یا سفته هست؟', a: `بله. ${chequeSentence()}` },
  ];
}
