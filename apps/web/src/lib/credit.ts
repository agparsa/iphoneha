import {
  CREDIT_METHOD_LABELS,
  creditPlanReady,
  formatNumberFa,
  formatPercentFa,
  formatToman,
  PAYMENT_METHOD_INFO,
  type CreditMethod,
  type CreditPlan,
  type InstallmentMethod,
  type ReadyCreditPlan,
  type StorefrontConfigDto,
} from '@iphoneha/shared';
import { warrantySentence, type FaqItem } from './store-copy';

/**
 * Copy for the instalment pages (آیفون قسطی، خرید گوشی با چک، خرید آیفون با
 * سفته). Every figure comes from the owner's settings (پنل ← تنظیمات ← چک و
 * سفته); where he has not entered one yet, the sentence says how it is decided
 * instead of inventing a number.
 */

type Config = Pick<StorefrontConfigDto, 'store' | 'credit' | 'installments'>;

export const CREDIT_PAGES: Record<CreditMethod, { path: string; title: string; short: string }> = {
  CHEQUE: { path: '/installments/cheque', title: 'خرید گوشی با چک', short: 'چک صیادی' },
  SAFTE: { path: '/installments/safte', title: 'خرید آیفون با سفته', short: 'سفته' },
};

/** Accent colour per plan (the text shade is derived for contrast). */
export const CREDIT_COLORS: Record<CreditMethod, string> = {
  CHEQUE: '#0e8a5c',
  SAFTE: '#7c3aed',
};

export function planOf(config: Pick<StorefrontConfigDto, 'credit'>, method: CreditMethod): CreditPlan {
  return method === 'CHEQUE' ? config.credit.cheque : config.credit.safte;
}

/** Plans the store offers, in the order they are presented. */
export function offeredMethods(config: Pick<StorefrontConfigDto, 'credit'>): CreditMethod[] {
  return (['CHEQUE', 'SAFTE'] as const).filter((method) => planOf(config, method).enabled);
}

/** The owner's document list, one per line. */
export function planDocuments(plan: CreditPlan, method: CreditMethod): string[] {
  const own = plan.documents
    .split('\n')
    .map((line) => line.replace(/^[-•*\d.)\s]+/, '').trim())
    .filter(Boolean);
  if (own.length > 0) return own;
  // what any cheque or promissory-note purchase needs; the specialist confirms the rest
  return method === 'CHEQUE'
    ? ['کارت ملی خریدار', 'دسته‌چک صیادی به نام خود خریدار']
    : ['کارت ملی خریدار', 'سفتهٔ کاغذی یا الکترونیک به مبلغی که در قرارداد نوشته می‌شود'];
}

export interface PlanFact {
  label: string;
  value: string;
}

/** The figures the owner has entered, ready for a row of cards. */
export function planFacts(plan: CreditPlan, config: Pick<StorefrontConfigDto, 'credit'>): PlanFact[] {
  const facts: PlanFact[] = [];
  if (plan.minDownPaymentPercent !== null) {
    facts.push({
      label: 'پیش‌پرداخت',
      value:
        plan.minDownPaymentPercent === 0
          ? 'بدون پیش‌پرداخت'
          : `از ${formatNumberFa(plan.minDownPaymentPercent)}٪`,
    });
  }
  if (plan.maxMonths !== null)
    facts.push({ label: 'تعداد اقساط', value: `تا ${formatNumberFa(plan.maxMonths)} ماه` });
  if (plan.monthlyFeePercent !== null) {
    facts.push({
      label: 'کارمزد',
      value:
        plan.monthlyFeePercent === 0
          ? 'بدون کارمزد'
          : `${formatPercentFa(plan.monthlyFeePercent)}٪ ماهانه روی مانده`,
    });
  }
  if (plan.maxFinanced !== null) facts.push({ label: 'سقف اقساط', value: formatToman(plan.maxFinanced) });
  if (plan.guarantor) facts.push({ label: 'ضامن', value: plan.guarantor });
  if (config.credit.approvalTime) facts.push({ label: 'زمان بررسی', value: config.credit.approvalTime });
  return facts;
}

/** «پیش‌پرداخت از ۳۰٪ و تا ۱۲ قسط» — or how the terms are set when there are no figures yet. */
export function planSummary(plan: CreditPlan): string {
  if (!creditPlanReady(plan)) {
    return 'پیش‌پرداخت و تعداد اقساط بر اساس مدل و نتیجهٔ بررسی تعیین و پیش از قرارداد، مکتوب اعلام می‌شود';
  }
  const down =
    plan.minDownPaymentPercent === 0
      ? 'بدون پیش‌پرداخت'
      : `پیش‌پرداخت از ${formatNumberFa(plan.minDownPaymentPercent)}٪`;
  const fee =
    plan.monthlyFeePercent === 0
      ? 'بدون کارمزد'
      : `کارمزد ${formatPercentFa(plan.monthlyFeePercent)}٪ در ماه`;
  return `${down}، تا ${formatNumberFa(plan.maxMonths)} قسط و ${fee}`;
}

function guarantorAnswer(plan: CreditPlan): string {
  return plan.guarantor
    ? `${plan.guarantor}. اگر برای مبلغ اقساط تو شرط دیگری لازم باشد، کارشناس ما پیش از قرارداد می‌گوید.`
    : 'نیاز به ضامن پس از بررسی و بسته به مبلغ اقساط اعلام می‌شود و پیش از قرارداد می‌دانی.';
}

function feeAnswer(plan: CreditPlan): string {
  if (plan.monthlyFeePercent === null) {
    return 'کارمزد به‌صورت درصدی ثابت برای هر ماه روی مبلغ باقی‌مانده پس از پیش‌پرداخت حساب می‌شود و جمع کل پرداختی پیش از امضا در قرارداد نوشته می‌شود.';
  }
  if (plan.monthlyFeePercent === 0) return 'اقساط این روش کارمزد ندارد؛ جمع اقساط برابر مبلغ باقی‌مانده است.';
  return `کارمزد ${formatPercentFa(plan.monthlyFeePercent)}٪ در ماه است و فقط روی مبلغ باقی‌مانده پس از پیش‌پرداخت حساب می‌شود؛ مثلاً برای ۶ قسط، ${formatNumberFa(plan.monthlyFeePercent * 6)}٪ به مانده اضافه می‌شود. جمع کل پرداختی پیش از امضا در قرارداد نوشته می‌شود.`;
}

function downPaymentAnswer(plan: CreditPlan): string {
  if (plan.minDownPaymentPercent === null) {
    return 'پیش‌پرداخت بر اساس مدل و نتیجهٔ بررسی تعیین می‌شود؛ هرچه پیش‌پرداخت بیشتر باشد، کارمزد کمتری می‌پردازی.';
  }
  const ceiling =
    plan.maxFinanced !== null
      ? ` اگر مانده از ${formatToman(plan.maxFinanced)} بیشتر شود، پیش‌پرداخت به همان اندازه بالا می‌رود.`
      : '';
  return plan.minDownPaymentPercent === 0
    ? `این روش پیش‌پرداخت ندارد.${ceiling}`
    : `حداقل ${formatNumberFa(plan.minDownPaymentPercent)}٪ قیمت گوشی؛ پیش‌پرداخت بیشتر هم پذیرفته می‌شود و کارمزد را کم می‌کند.${ceiling}`;
}

function monthsAnswer(plan: CreditPlan): string {
  return plan.maxMonths === null
    ? 'تعداد اقساط بسته به مدل و مبلغ تعیین می‌شود و پیش از قرارداد اعلام می‌شود.'
    : `تا ${formatNumberFa(plan.maxMonths)} قسط ماهانه؛ اقساط کمتر هم ممکن است و جمع کارمزد را کم می‌کند.`;
}

function genuineAnswer(config: Config): string {
  return (
    warrantySentence(config) ?? 'همهٔ دستگاه‌ها آکبند، پلمپ و اصل‌اند و با ضمانت اصالت کالا عرضه می‌شوند.'
  );
}

export function chequeFaq(config: Config): FaqItem[] {
  const plan = config.credit.cheque;
  return [
    {
      q: 'خرید گوشی با چک چطور انجام می‌شود؟',
      a: 'مدل و حافظه را انتخاب می‌کنی و فرم درخواست را پر می‌کنی یا تماس می‌گیری. کارشناس ما وضعیت چک را با شناسهٔ صیادی استعلام می‌کند، پیش‌پرداخت و مبلغ هر چک را اعلام می‌کند، قرارداد مکتوب تنظیم می‌شود و چک‌ها را در سامانهٔ صیاد به نام فروشگاه ثبت می‌کنی. پس از پیش‌پرداخت، گوشی ارسال می‌شود.',
    },
    { q: 'برای خرید آیفون با چک چه مدارکی لازم است؟', a: `${planDocuments(plan, 'CHEQUE').join('، ')}.` },
    { q: 'پیش‌پرداخت خرید گوشی با چک چقدر است؟', a: downPaymentAnswer(plan) },
    { q: 'حداکثر چند قسط می‌توانم بگیرم؟', a: monthsAnswer(plan) },
    { q: 'کارمزد اقساط چک چطور حساب می‌شود؟', a: feeAnswer(plan) },
    { q: 'برای خرید با چک ضامن لازم است؟', a: guarantorAnswer(plan) },
    {
      q: 'چک باید صیادی باشد؟',
      a: 'بله. چک‌ها باید صیادی باشند و طبق قانون جدید چک، پیش از تحویل با مبلغ و تاریخ هر قسط در سامانهٔ صیاد به نام فروشگاه ثبت شوند. ثبت با اپلیکیشن یا اینترنت‌بانک بانکت یا برنامهٔ پیچک بانک مرکزی انجام می‌شود.',
    },
    {
      q: 'باید برای قرارداد حضوری مراجعه کنم؟',
      a: 'نه. استعلام، قرارداد و ثبت چک غیرحضوری انجام می‌شود و گوشی به همهٔ شهرهای ایران ارسال می‌شود.',
    },
    {
      q: 'وضعیت اعتباری چکم سفید نیست؛ باز هم می‌توانم قسطی بخرم؟',
      a: 'پس از استعلام، کارشناس ما شرایط را بررسی می‌کند. اگر خرید با چک ممکن نبود، خرید با سفته را پیشنهاد می‌کنیم.',
    },
    { q: 'گوشی‌ها آکبند و اصل هستند؟', a: genuineAnswer(config) },
  ];
}

export function safteFaq(config: Config): FaqItem[] {
  const plan = config.credit.safte;
  return [
    {
      q: 'خرید آیفون با سفته چطور انجام می‌شود؟',
      a: 'مدل و حافظه را انتخاب می‌کنی و فرم درخواست را پر می‌کنی یا تماس می‌گیری. کارشناس ما مدارک را بررسی و پیش‌پرداخت، تعداد اقساط و مبلغ سفته را اعلام می‌کند. پس از امضای قرارداد و پرداخت پیش‌پرداخت، گوشی ارسال می‌شود و اقساط را هر ماه طبق جدول قرارداد واریز می‌کنی.',
    },
    { q: 'برای خرید گوشی با سفته چه مدارکی لازم است؟', a: `${planDocuments(plan, 'SAFTE').join('، ')}.` },
    { q: 'برای خرید آیفون با سفته ضامن لازم است؟', a: guarantorAnswer(plan) },
    { q: 'پیش‌پرداخت خرید با سفته چقدر است؟', a: downPaymentAnswer(plan) },
    { q: 'حداکثر چند قسط می‌توانم بگیرم؟', a: monthsAnswer(plan) },
    { q: 'کارمزد اقساط سفته چطور حساب می‌شود؟', a: feeAnswer(plan) },
    {
      q: 'سفتهٔ الکترونیک هم پذیرفته می‌شود؟',
      a: 'نوع سفته (کاغذی یا الکترونیک) و مبلغ آن در قرارداد مشخص می‌شود؛ کارشناس ما پیش از قرارداد می‌گوید کدام را آماده کنی.',
    },
    {
      q: 'بعد از تسویهٔ اقساط، سفته چه می‌شود؟',
      a: 'سفته فقط تضمین پرداخت اقساط است و پس از تسویهٔ کامل به تو برگردانده می‌شود.',
    },
    {
      q: 'باید برای قرارداد حضوری مراجعه کنم؟',
      a: 'نه. بررسی و قرارداد غیرحضوری انجام می‌شود و گوشی به همهٔ شهرهای ایران ارسال می‌شود.',
    },
    { q: 'گوشی‌ها آکبند و اصل هستند؟', a: genuineAnswer(config) },
  ];
}

export function installmentsFaq(config: Config, serviceNames: string): FaqItem[] {
  const methods = offeredMethods(config).map((method) => CREDIT_METHOD_LABELS[method]);
  const live = config.installments.length > 0;
  return [
    {
      q: 'آیفون قسطی را چطور بخرم؟',
      a: `${methods.length ? `با ${methods.join(' یا ')}: مدل را انتخاب کن و فرم درخواست را بفرست یا تماس بگیر؛ استعلام و قرارداد غیرحضوری است. ` : ''}${
        live ? `با ${serviceNames} هم می‌توانی در مرحلهٔ پرداخت سفارش، قسطی بخری.` : ''
      }`.trim(),
    },
    {
      q: 'خرید گوشی قسطی با چک بهتر است یا با سفته؟',
      a: 'اگر دسته‌چک صیادی و سابقهٔ چک سالم داری، خرید با چک معمولاً سریع‌تر است. اگر دسته‌چک نداری، خرید با سفته راه توست؛ ممکن است پیش‌پرداخت بیشتر یا ضامن لازم باشد.',
    },
    {
      q: 'بدون چک هم می‌شود آیفون قسطی خرید؟',
      a: live
        ? `بله؛ با سفته یا با سرویس‌های اعتباری ${serviceNames}.`
        : 'بله؛ با سفته. شرایط کامل در صفحهٔ خرید آیفون با سفته آمده است.',
    },
    {
      q: 'پیش‌پرداخت و تعداد اقساط چقدر است؟',
      a: offeredMethods(config)
        .map((method) => `${CREDIT_METHOD_LABELS[method]}: ${planSummary(planOf(config, method))}.`)
        .join(' '),
    },
    {
      q: 'قسط ماهانه را چطور حساب کنم؟',
      a: 'با محاسبه‌گر همین صفحه: مدل، روش، پیش‌پرداخت و تعداد اقساط را انتخاب کن تا قسط ماهانه و جمع کل پرداختی را ببینی.',
    },
    {
      q: 'آیفون قسطی به شهرستان هم ارسال می‌شود؟',
      a: 'بله. خرید اقساطی غیرحضوری است و گوشی به همهٔ شهرهای ایران ارسال می‌شود.',
    },
    { q: 'گوشی‌ها آکبند و اصل هستند؟', a: genuineAnswer(config) },
  ].filter((item) => item.a.length > 0);
}

// ─── calculator ──────────────────────────────────────────────────────────────

/** One option in the plan calculator: a store plan or an online credit service, in one shape. */
export interface CalculatorPlan {
  id: string;
  kind: 'store' | 'service';
  method: CreditMethod | null;
  service: InstallmentMethod | null;
  name: string;
  color: string;
  minDownPaymentPercent: number;
  maxMonths: number;
  monthlyFeePercent: number;
  /** a ceiling on what is paid in instalments; above it the down payment rises */
  maxFinanced: number | null;
}

/** The store's plans with every figure filled in (a plan without them cannot be calculated). */
export function storeCalculatorPlans(config: Pick<StorefrontConfigDto, 'credit'>): CalculatorPlan[] {
  return offeredMethods(config).flatMap((method): CalculatorPlan[] => {
    const plan = planOf(config, method);
    if (!creditPlanReady(plan)) return [];
    return [
      {
        id: method,
        kind: 'store',
        method,
        service: null,
        name: CREDIT_METHOD_LABELS[method],
        color: CREDIT_COLORS[method],
        minDownPaymentPercent: plan.minDownPaymentPercent,
        maxMonths: plan.maxMonths,
        monthlyFeePercent: plan.monthlyFeePercent,
        maxFinanced: plan.maxFinanced,
      },
    ];
  });
}

/** The live online credit services (none until the store has a contract with them). */
export function serviceCalculatorPlans(config: Pick<StorefrontConfigDto, 'installments'>): CalculatorPlan[] {
  return config.installments.map((term) => ({
    id: term.method,
    kind: 'service',
    method: null,
    service: term.method,
    name: PAYMENT_METHOD_INFO[term.method].name,
    color: PAYMENT_METHOD_INFO[term.method].color,
    minDownPaymentPercent: term.minDownPaymentPercent,
    maxMonths: term.maxInstallments,
    // services quote a yearly flat rate; the calculator works per month
    monthlyFeePercent: (term.annualFeeRate * 100) / 12,
    maxFinanced: term.maxCredit,
  }));
}

/** A calculator plan in the shape the estimate helpers take. */
export function readyCreditPlan(plan: CalculatorPlan): ReadyCreditPlan {
  return {
    enabled: true,
    minDownPaymentPercent: plan.minDownPaymentPercent,
    maxMonths: plan.maxMonths,
    monthlyFeePercent: plan.monthlyFeePercent,
    maxFinanced: plan.maxFinanced,
    documents: '',
    guarantor: '',
    notes: '',
  };
}

// ─── how-to steps ────────────────────────────────────────────────────────────

export interface CreditStep {
  title: string;
  text: string;
}

function callBack(config: Pick<StorefrontConfigDto, 'credit'>): string {
  return config.credit.approvalTime ? `ظرف ${config.credit.approvalTime}` : 'در ساعت کاری';
}

/** «مراحل خرید آیفون قسطی» — whichever way the customer pays the store. */
export function installmentSteps(config: Pick<StorefrontConfigDto, 'credit'>): CreditStep[] {
  return [
    {
      title: 'انتخاب مدل و روش پرداخت',
      text: 'مدل، رنگ و حافظهٔ آیفون را انتخاب کن و بین چک صیادی و سفته یکی را برگزین؛ قسط ماهانه را با محاسبه‌گر همین صفحه ببین.',
    },
    {
      title: 'ثبت درخواست یا تماس',
      text: `فرم کوتاه درخواست را بفرست یا تماس بگیر؛ کارشناس فروش ${callBack(config)} با تو تماس می‌گیرد.`,
    },
    {
      title: 'بررسی و استعلام',
      text: 'برای خرید با چک، وضعیت اعتباری با شناسهٔ صیادی استعلام می‌شود؛ برای سفته، مدارک و مبلغ سفته بررسی می‌شود.',
    },
    {
      title: 'قرارداد غیرحضوری',
      text: 'پیش‌پرداخت، تعداد و مبلغ اقساط و جمع کل پرداختی در قرارداد مکتوب نوشته می‌شود؛ لازم نیست به فروشگاه بیایی.',
    },
    {
      title: 'پیش‌پرداخت و تضمین اقساط',
      text: 'پیش‌پرداخت را واریز می‌کنی و چک‌ها را در سامانهٔ صیاد به نام فروشگاه ثبت می‌کنی یا سفته را صادر می‌کنی.',
    },
    {
      title: 'ارسال آیفون آکبند',
      text: 'گوشی آکبند و اصل به همهٔ شهرهای ایران ارسال می‌شود و اقساط را طبق جدول قرارداد می‌پردازی.',
    },
  ];
}

export function chequeSteps(config: Pick<StorefrontConfigDto, 'credit'>): CreditStep[] {
  return [
    {
      title: 'ثبت درخواست خرید با چک',
      text: `مدل را انتخاب کن و فرم را بفرست یا تماس بگیر؛ کارشناس ما ${callBack(config)} تماس می‌گیرد.`,
    },
    {
      title: 'استعلام وضعیت چک صیادی',
      text: 'شناسهٔ ۱۶ رقمی صیادی یکی از برگه‌های دسته‌چکت را می‌دهی تا وضعیت اعتباری‌ات در سامانهٔ صیاد استعلام شود.',
    },
    {
      title: 'اعلام شرایط و قرارداد',
      text: 'پیش‌پرداخت، تعداد و مبلغ هر چک و جمع کل پرداختی اعلام و در قرارداد غیرحضوری نوشته می‌شود.',
    },
    {
      title: 'ثبت چک‌ها به نام فروشگاه',
      text: 'هر چک را با مبلغ و تاریخ سررسید در اپلیکیشن بانک یا اینترنت‌بانک در سامانهٔ صیاد به نام فروشگاه ثبت می‌کنی؛ تحویل اصل برگه‌ها طبق هماهنگی کارشناس است.',
    },
    {
      title: 'پیش‌پرداخت و ارسال',
      text: 'پس از واریز پیش‌پرداخت، آیفون آکبند به نشانی‌ات در هر شهری که باشی ارسال می‌شود.',
    },
  ];
}

export function safteSteps(config: Pick<StorefrontConfigDto, 'credit'>): CreditStep[] {
  return [
    {
      title: 'ثبت درخواست خرید با سفته',
      text: `مدل را انتخاب کن و فرم را بفرست یا تماس بگیر؛ کارشناس ما ${callBack(config)} تماس می‌گیرد.`,
    },
    {
      title: 'بررسی مدارک',
      text: 'کارت ملی و مدارکی را که کارشناس می‌گوید می‌فرستی تا پیش‌پرداخت، اقساط و مبلغ سفته مشخص شود.',
    },
    {
      title: 'قرارداد غیرحضوری',
      text: 'جدول اقساط، مبلغ سفته و جمع کل پرداختی در قرارداد مکتوب نوشته می‌شود.',
    },
    {
      title: 'صدور سفته',
      text: 'سفتهٔ کاغذی را از شعب بانک ملی تهیه می‌کنی یا سفتهٔ الکترونیک را با احراز هویت و امضای دیجیتال صادر می‌کنی، به مبلغی که در قرارداد آمده است.',
    },
    {
      title: 'پیش‌پرداخت و ارسال',
      text: 'پس از واریز پیش‌پرداخت، آیفون آکبند به نشانی‌ات در هر شهری که باشی ارسال می‌شود.',
    },
    {
      title: 'تسویه و پس گرفتن سفته',
      text: 'اقساط را هر ماه طبق جدول قرارداد می‌پردازی و با پرداخت آخرین قسط، سفته به تو برگردانده می‌شود.',
    },
  ];
}

// ─── meta descriptions ───────────────────────────────────────────────────────

/** «پیش‌پرداخت از ۳۰٪ و تا ۱۲ قسط» for a meta description, or nothing while the figures are blank. */
function shortTerms(plan: CreditPlan): string | null {
  if (plan.minDownPaymentPercent === null || plan.maxMonths === null) return null;
  const down =
    plan.minDownPaymentPercent === 0
      ? 'بدون پیش‌پرداخت'
      : `پیش‌پرداخت از ${formatNumberFa(plan.minDownPaymentPercent)}٪`;
  return `${down} و تا ${formatNumberFa(plan.maxMonths)} قسط`;
}

export function installmentsDescription(config: Pick<StorefrontConfigDto, 'credit'>): string {
  const terms = shortTerms(config.credit.cheque);
  return terms
    ? `خرید آیفون قسطی با چک صیادی یا سفته از آیفونی‌ها؛ ${terms}. قسط هر مدل را حساب کن و آنلاین درخواست بده؛ قرارداد غیرحضوری و ارسال به سراسر ایران.`
    : 'خرید آیفون قسطی با چک صیادی یا سفته از آیفونی‌ها؛ قیمت اقساطی هر مدل، مراحل خرید و درخواست آنلاین. قرارداد غیرحضوری و ارسال به سراسر ایران.';
}

export function chequeDescription(config: Pick<StorefrontConfigDto, 'credit'>): string {
  const terms = shortTerms(config.credit.cheque);
  return `خرید گوشی آیفون با چک صیادی از آیفونی‌ها${terms ? `؛ ${terms}` : ''}. استعلام، قرارداد و ثبت چک غیرحضوری است و آیفون آکبند به سراسر ایران ارسال می‌شود.`;
}

export function safteDescription(config: Pick<StorefrontConfigDto, 'credit'>): string {
  const terms = shortTerms(config.credit.safte);
  return `خرید آیفون با سفته و بدون دسته‌چک از آیفونی‌ها${terms ? `؛ ${terms}` : ''}. سفتهٔ کاغذی یا الکترونیک، قرارداد غیرحضوری و ارسال آیفون آکبند به سراسر ایران.`;
}

/** Visible «به‌روزرسانی» date of the instalment pages: prices and terms are read live. */
export function todayFa(): string {
  return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(new Date());
}
