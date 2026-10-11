import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { CheckCircle2, FileText, Smartphone } from 'lucide-react';
import { creditPageData } from '@/lib/credit-page-data';
import {
  CREDIT_COLORS,
  CREDIT_PAGES,
  offeredMethods,
  planDocuments,
  planFacts,
  planOf,
  planSummary,
  safteDescription,
  safteFaq,
  safteSteps,
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
import { ModelPriceTable } from '@/components/credit/model-price-table';
import { NumberedSteps } from '@/components/credit/numbered-steps';
import { PlanFacts } from '@/components/credit/plan-facts';
import { RelatedArticles } from '@/components/mag/related-articles';

const PATH = CREDIT_PAGES.SAFTE.path;
const TITLE = 'خرید آیفون با سفته | خرید گوشی قسطی بدون چک';
const OG_IMAGE = {
  url: '/covers/installments-safte.jpg',
  width: 1200,
  height: 630,
  alt: 'خرید آیفون با سفته',
};

const KINDS = [
  {
    icon: FileText,
    title: 'سفتهٔ کاغذی',
    text: 'برگ سفته را از شعب بانک ملی می‌خری؛ هر برگ سقف مبلغی دارد، پس برگی را بخر که سقفش از مبلغ قرارداد کمتر نباشد.',
  },
  {
    icon: Smartphone,
    title: 'سفتهٔ الکترونیک',
    text: 'در سامانه‌ها و اپلیکیشن‌های مجاز با احراز هویت و امضای دیجیتال صادر می‌شود؛ بدون رفتن به بانک و بدون برگهٔ کاغذی.',
  },
];

const TIPS = [
  'مبلغ سفته را به عدد و به حروف، همان‌طور که در قرارداد آمده، بنویس.',
  'نام گیرنده را بنویس؛ سفتهٔ سفیدامضا به کسی نده.',
  'تاریخ و محل پرداخت را کامل کن و پای سفته را امضا کن.',
  'از سفته‌ای که تحویل می‌دهی عکس یا رسید نگه دار.',
  'پس از تسویهٔ آخرین قسط، اصل سفته یا ابطال سفتهٔ الکترونیک را تحویل بگیر.',
];

export async function generateMetadata(): Promise<Metadata> {
  const { config } = await creditPageData();
  if (!planOf(config, 'SAFTE').enabled) return {};
  const description = safteDescription(config);
  return {
    title: TITLE,
    description,
    alternates: { canonical: PATH },
    openGraph: { type: 'website', url: PATH, title: TITLE, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: TITLE, description, images: [OG_IMAGE.url] },
  };
}

export const revalidate = 300;

export default async function SaftePage() {
  const { config, products, models, articles, heroImage } = await creditPageData();
  const plan = planOf(config, 'SAFTE');
  if (!plan.enabled) notFound();

  // the promissory-note plan first; a visitor with a chequebook can still switch
  const offered = offeredMethods(config);
  const methods = (['SAFTE', 'CHEQUE'] as const).filter((method) => offered.includes(method));
  const plans = storeCalculatorPlans(config).filter((item) => item.method === 'SAFTE');
  const faq = safteFaq(config);
  const facts = planFacts(plan, config);
  const crumbs = [
    { name: 'آیفونی‌ها', href: '/' },
    { name: 'آیفون قسطی', href: '/installments' },
    { name: 'خرید آیفون با سفته', href: PATH },
  ];

  return (
    <CreditSelectionProvider initialMethod="SAFTE">
      <div className="container-page space-y-14 py-5 md:py-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([
            breadcrumbLd(crumbs),
            faqLd(faq),
            itemListLd(products, 'قیمت آیفون اقساطی با سفته'),
          ])}
        />
        <div>
          <Breadcrumbs items={crumbs} />
          <CreditHero
            eyebrow="اقساط با سفته، بدون چک"
            title="خرید آیفون با سفته"
            lead={
              <p>
                دسته‌چک نداری؟ آیفون را با سفته قسطی بخر؛ {planSummary(plan)}. بررسی مدارک و قرارداد غیرحضوری
                است، سفتهٔ کاغذی یا الکترونیک پذیرفته می‌شود و گوشی آکبند به همهٔ شهرهای ایران ارسال می‌شود.
              </p>
            }
            pills={[{ label: 'سفته', method: 'SAFTE', color: CREDIT_COLORS.SAFTE }]}
            phone={config.store.phone}
            requestLabel="درخواست خرید با سفته"
            calculator={plans.length > 0 && models.length > 0}
            image={heroImage}
          />
        </div>

        {facts.length > 0 ? (
          <section>
            <SectionHeader eyebrow="Terms" title="شرایط خرید آیفون با سفته" />
            <PlanFacts facts={facts} color={CREDIT_COLORS.SAFTE} />
            {plan.notes ? <p className="mt-3 text-[12px] leading-6 text-muted">{plan.notes}</p> : null}
          </section>
        ) : null}

        {plans.length > 0 && models.length > 0 ? (
          <section id="calculator" className="scroll-mt-24">
            <SectionHeader
              eyebrow="Calculator"
              title="محاسبهٔ قسط خرید با سفته"
              description="مدل، پیش‌پرداخت و تعداد اقساط را انتخاب کن تا قسط ماهانه و جمع کل پرداختی را ببینی."
            />
            <CreditPlanCalculator plans={plans} models={models} />
          </section>
        ) : null}

        <section id="prices" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Prices"
            title="قیمت آیفون اقساطی با سفته"
            description={
              plans.length > 0
                ? 'قیمت نقد هر مدل و قسط ماهانه با حداقل پیش‌پرداخت و بیشترین تعداد اقساط؛ قیمت‌ها از فهرست روز فروشگاه است.'
                : 'قیمت نقد هر مدل از فهرست روز فروشگاه؛ پیش‌پرداخت، اقساط و مبلغ سفته را کارشناس ما پس از بررسی اعلام می‌کند.'
            }
          />
          <ModelPriceTable models={models} plans={plans} caption="قیمت نقد و اقساطی آیفون با سفته" />
        </section>

        <section>
          <SectionHeader
            eyebrow="How it works"
            title="مراحل خرید آیفون با سفته"
            description="از درخواست تا پس گرفتن سفته؛ بدون مراجعهٔ حضوری."
          />
          <NumberedSteps steps={safteSteps(config)} />
        </section>

        <section className="grid gap-6 lg:grid-cols-2">
          <div>
            <SectionHeader eyebrow="Documents" title="مدارک لازم برای خرید با سفته" />
            <ul className="grid gap-2.5 rounded-panel border border-line p-5 text-[13px] text-ink-muted">
              {planDocuments(plan, 'SAFTE').map((doc) => (
                <li key={doc} className="flex items-start gap-2.5">
                  <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#6d28d9]" aria-hidden />
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
            <SectionHeader eyebrow="Paper or digital" title="سفتهٔ کاغذی یا الکترونیک؟" />
            <ul className="grid gap-3">
              {KINDS.map((kind) => (
                <li key={kind.title} className="flex items-start gap-3 rounded-panel border border-line p-4">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#f3eefe] text-[#6d28d9]">
                    <kind.icon className="size-5" aria-hidden />
                  </span>
                  <span>
                    <span className="block text-[14px] font-semibold text-ink">{kind.title}</span>
                    <span className="mt-1 block text-[12px] leading-6 text-muted">{kind.text}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[12px] leading-6 text-muted">
              نوع سفته و مبلغ آن در قرارداد مشخص می‌شود؛ کارشناس ما پیش از قرارداد می‌گوید کدام را آماده کنی.
            </p>
          </div>
        </section>

        <section>
          <SectionHeader eyebrow="Tips" title="نکته‌های نوشتن سفته برای خرید قسطی" />
          <ol className="grid list-decimal gap-2 rounded-panel border border-line p-5 ps-10 text-[13px] leading-7 text-ink-muted">
            {TIPS.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ol>
        </section>

        <section id="request" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Request"
            title="درخواست خرید آیفون با سفته"
            description="نام و شماره‌ات را بگذار؛ کارشناس فروش تماس می‌گیرد، مدارک را بررسی می‌کند و قرارداد را هماهنگ می‌کند."
          />
          <CreditRequestForm
            models={models}
            methods={methods}
            defaultMethod="SAFTE"
            source={PATH}
            approvalTime={config.credit.approvalTime}
            phone={config.store.phone}
          />
        </section>

        {methods.includes('CHEQUE') ? (
          <CreditCrossLink
            method="CHEQUE"
            question="دسته‌چک صیادی داری؟"
            text="خرید گوشی با چک معمولاً سریع‌تر است؛ شرایط و محاسبهٔ اقساطش را ببین."
          />
        ) : null}

        <RelatedArticles
          articles={articles}
          prefer={[
            'buy-iphone-with-safte',
            'installment-phone-buying-guide',
            'iphone-installment-calculation',
          ]}
        />

        <section>
          <SectionHeader eyebrow="FAQ" title="سؤال‌های متداول خرید آیفون با سفته" />
          <FaqSection items={faq} />
          <p className="mt-4 text-[11px] text-muted">
            قیمت‌ها و شرایط این صفحه از تنظیمات روز فروشگاه خوانده می‌شود؛ به‌روزرسانی: {todayFa()}
          </p>
        </section>
      </div>
    </CreditSelectionProvider>
  );
}
