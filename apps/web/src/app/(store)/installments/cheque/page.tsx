import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2 } from 'lucide-react';
import { creditPageData } from '@/lib/credit-page-data';
import {
  CREDIT_COLORS,
  CREDIT_PAGES,
  chequeDescription,
  chequeFaq,
  chequeSteps,
  offeredMethods,
  planDocuments,
  planFacts,
  planOf,
  planSummary,
  storeCalculatorPlans,
  todayFa,
} from '@/lib/credit';
import { breadcrumbLd, faqLd, itemListLd, jsonLdScript } from '@/lib/seo';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { FaqSection } from '@/components/store/faq-section';
import { SectionHeader } from '@/components/store/section-header';
import { CreditCrossLink } from '@/components/credit/credit-cross-link';
import { CreditHero } from '@/components/credit/credit-hero';
import { CreditPlanCalculator } from '@/components/credit/credit-plan-calculator';
import { CreditRequestForm } from '@/components/credit/credit-request-form';
import { CreditSelectionProvider } from '@/components/credit/credit-selection';
import { CreditStatusColors } from '@/components/credit/credit-status-colors';
import { ModelPriceTable } from '@/components/credit/model-price-table';
import { NumberedSteps } from '@/components/credit/numbered-steps';
import { PlanFacts } from '@/components/credit/plan-facts';
import { RelatedArticles } from '@/components/mag/related-articles';

const PATH = CREDIT_PAGES.CHEQUE.path;
const TITLE = 'خرید گوشی با چک صیادی | آیفون اقساطی با چک';
const OG_IMAGE = {
  url: '/covers/installments-cheque.jpg',
  width: 1200,
  height: 630,
  alt: 'خرید گوشی با چک صیادی',
};

export async function generateMetadata(): Promise<Metadata> {
  const { config } = await creditPageData();
  if (!planOf(config, 'CHEQUE').enabled) return {};
  const description = chequeDescription(config);
  return {
    title: TITLE,
    description,
    alternates: { canonical: PATH },
    openGraph: { type: 'website', url: PATH, title: TITLE, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: TITLE, description, images: [OG_IMAGE.url] },
  };
}

export const revalidate = 300;

export default async function ChequePage() {
  const { config, products, models, articles, heroImage } = await creditPageData();
  const plan = planOf(config, 'CHEQUE');
  if (!plan.enabled) notFound();

  const methods = offeredMethods(config); // the cheque plan first, the other one to switch to
  const plans = storeCalculatorPlans(config).filter((item) => item.method === 'CHEQUE');
  const faq = chequeFaq(config);
  const facts = planFacts(plan, config);
  const crumbs = [
    { name: 'آیفونی‌ها', href: '/' },
    { name: 'آیفون قسطی', href: '/installments' },
    { name: 'خرید گوشی با چک', href: PATH },
  ];

  return (
    <CreditSelectionProvider initialMethod="CHEQUE">
      <div className="container-page space-y-14 py-5 md:py-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([
            breadcrumbLd(crumbs),
            faqLd(faq),
            itemListLd(products, 'قیمت آیفون اقساطی با چک'),
          ])}
        />
        <div>
          <Breadcrumbs items={crumbs} />
          <CreditHero
            eyebrow="اقساط با چک صیادی"
            title="خرید گوشی با چک صیادی"
            lead={
              <p>
                آیفون را با چک صیادی و به‌صورت اقساطی بخر؛ {planSummary(plan)}. استعلام چک، قرارداد و ثبت
                چک‌ها در سامانهٔ صیاد غیرحضوری انجام می‌شود و گوشی آکبند به همهٔ شهرهای ایران ارسال می‌شود.
              </p>
            }
            pills={[{ label: 'چک صیادی', method: 'CHEQUE', color: CREDIT_COLORS.CHEQUE }]}
            phone={config.store.phone}
            requestLabel="درخواست خرید با چک"
            calculator={plans.length > 0 && models.length > 0}
            image={heroImage}
          />
        </div>

        {facts.length > 0 ? (
          <section>
            <SectionHeader eyebrow="Terms" title="شرایط خرید گوشی با چک" />
            <PlanFacts facts={facts} color={CREDIT_COLORS.CHEQUE} />
            {plan.notes ? <p className="mt-3 text-[12px] leading-6 text-muted">{plan.notes}</p> : null}
          </section>
        ) : null}

        {plans.length > 0 && models.length > 0 ? (
          <section id="calculator" className="scroll-mt-24">
            <SectionHeader
              eyebrow="Calculator"
              title="محاسبهٔ قسط خرید با چک"
              description="مدل، پیش‌پرداخت و تعداد چک‌ها را انتخاب کن تا مبلغ هر چک و جمع کل پرداختی را ببینی."
            />
            <CreditPlanCalculator plans={plans} models={models} />
          </section>
        ) : null}

        <section id="prices" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Prices"
            title="قیمت آیفون اقساطی با چک"
            description={
              plans.length > 0
                ? 'قیمت نقد هر مدل و مبلغ هر چک ماهانه با حداقل پیش‌پرداخت و بیشترین تعداد اقساط؛ قیمت‌ها از فهرست روز فروشگاه است.'
                : 'قیمت نقد هر مدل از فهرست روز فروشگاه؛ پیش‌پرداخت و مبلغ چک‌ها را کارشناس ما پس از استعلام اعلام می‌کند.'
            }
          />
          <ModelPriceTable models={models} plans={plans} caption="قیمت نقد و اقساطی آیفون با چک صیادی" />
        </section>

        <section>
          <SectionHeader
            eyebrow="How it works"
            title="مراحل خرید گوشی با چک"
            description="پنج قدم، از درخواست تا تحویل؛ بدون مراجعهٔ حضوری."
          />
          <NumberedSteps steps={chequeSteps(config)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionHeader eyebrow="Documents" title="مدارک لازم برای خرید با چک" />
            <ul className="grid gap-2.5 rounded-panel border border-line p-5 text-[13px] text-ink-muted">
              {planDocuments(plan, 'CHEQUE').map((doc) => (
                <li key={doc} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
                  {doc}
                </li>
              ))}
              <li className="mt-1 border-t border-line pt-3 text-[12px] leading-6 text-muted">
                {plan.guarantor
                  ? `ضامن: ${plan.guarantor}.`
                  : 'نیاز به ضامن پس از بررسی و بسته به مبلغ اقساط اعلام می‌شود.'}
              </li>
            </ul>
          </div>
          <div>
            <SectionHeader eyebrow="Sayad" title="ثبت چک صیادی به نام فروشگاه" />
            <div className="rounded-panel border border-line p-5 text-[13px] leading-7 text-ink-muted">
              <p>
                طبق قانون جدید چک، هر چک صیادی باید پیش از تحویل در سامانهٔ صیاد به نام گیرنده ثبت شود؛ چکی که
                ثبت نشده باشد، در بانک پرداخت نمی‌شود. ثبت چند دقیقه طول می‌کشد:
              </p>
              <ol className="mt-3 grid list-decimal gap-1.5 ps-5 text-[12px] leading-6">
                <li>
                  اپلیکیشن یا اینترنت‌بانک بانکی را که دسته‌چک را داده باز کن و بخش «ثبت چک صیادی» را بزن.
                </li>
                <li>شناسهٔ ۱۶ رقمی برگهٔ چک، مبلغ و تاریخ سررسید را همان‌طور که در قرارداد آمده وارد کن.</li>
                <li>کد ملی یا شناسهٔ ملی گیرنده را که کارشناس ما می‌دهد وارد و ثبت را تأیید کن.</li>
                <li>
                  برای هر قسط همین کار را با برگهٔ بعدی تکرار کن؛ فروشگاه دریافت چک‌ها را در سامانه تأیید
                  می‌کند.
                </li>
              </ol>
            </div>
          </div>
        </section>

        <section>
          <SectionHeader
            eyebrow="Credit status"
            title="رنگ‌بندی وضعیت چک صیادی"
            description="بانک مرکزی وضعیت اعتباری صادرکنندهٔ چک را با پنج رنگ نشان می‌دهد. برای استعلام، شناسهٔ ۱۶ رقمی یکی از برگه‌های دسته‌چکت را در اپلیکیشن بانک یا سامانهٔ استعلام بانک مرکزی وارد کن یا به ۷۰۱۷۰۱ پیامک بزن."
          />
          <CreditStatusColors />
          <p className="mt-3 text-[12px] leading-6 text-muted">
            کارشناس ما پیش از قرارداد وضعیت چک را استعلام می‌کند. اگر خرید با چک ممکن نبود، خرید با سفته را
            پیشنهاد می‌کنیم.
          </p>
        </section>

        <section id="request" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Request"
            title="درخواست خرید گوشی با چک"
            description="نام و شماره‌ات را بگذار؛ کارشناس فروش تماس می‌گیرد، استعلام را انجام می‌دهد و قرارداد را هماهنگ می‌کند."
          />
          <CreditRequestForm
            models={models}
            methods={methods}
            defaultMethod="CHEQUE"
            source={PATH}
            approvalTime={config.credit.approvalTime}
            phone={config.store.phone}
          />
        </section>

        {methods.includes('SAFTE') ? (
          <CreditCrossLink
            method="SAFTE"
            question="دسته‌چک صیادی نداری؟"
            text="آیفون را با سفتهٔ کاغذی یا الکترونیک قسطی بخر."
          />
        ) : null}

        <RelatedArticles
          articles={articles}
          prefer={[
            'buy-iphone-with-sayad-cheque',
            'sayad-cheque-credit-status',
            'iphone-installment-calculation',
          ]}
        />

        <section>
          <SectionHeader eyebrow="FAQ" title="سؤال‌های متداول خرید گوشی با چک" />
          <FaqSection items={faq} />
          <p className="mt-4 text-[11px] text-muted">
            قیمت‌ها و شرایط این صفحه از تنظیمات روز فروشگاه خوانده می‌شود؛ به‌روزرسانی: {todayFa()}
          </p>
        </section>
      </div>
    </CreditSelectionProvider>
  );
}
