import type { Metadata } from 'next';
import { CREDIT_METHOD_LABELS, PAYMENT_METHOD_INFO } from '@iphoneha/shared';
import { hubBanners } from '@/lib/banners';
import { creditPageData } from '@/lib/credit-page-data';
import {
  CREDIT_COLORS,
  installmentSteps,
  installmentsDescription,
  installmentsFaq,
  offeredMethods,
  planOf,
  planSummary,
  serviceCalculatorPlans,
  storeCalculatorPlans,
  todayFa,
} from '@/lib/credit';
import { breadcrumbLd, faqLd, itemListLd, jsonLdScript } from '@/lib/seo';
import { installmentServiceNames } from '@/lib/store-copy';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { BannerCarousel } from '@/components/store/banner-carousel';
import { FaqSection } from '@/components/store/faq-section';
import { SectionHeader } from '@/components/store/section-header';
import { CreditCompare } from '@/components/credit/credit-compare';
import { CreditHero } from '@/components/credit/credit-hero';
import { CreditMethodCards } from '@/components/credit/credit-method-cards';
import { CreditPlanCalculator } from '@/components/credit/credit-plan-calculator';
import { CreditRequestForm } from '@/components/credit/credit-request-form';
import { CreditSelectionProvider } from '@/components/credit/credit-selection';
import { ModelPriceTable } from '@/components/credit/model-price-table';
import { NumberedSteps } from '@/components/credit/numbered-steps';
import { ServiceCards } from '@/components/credit/service-cards';
import { RelatedArticles } from '@/components/mag/related-articles';

const PATH = '/installments';
const TITLE = 'آیفون قسطی | خرید گوشی قسطی با چک و سفته';
const OG_IMAGE = {
  url: '/covers/installments.jpg',
  width: 1200,
  height: 630,
  alt: 'خرید آیفون قسطی با چک و سفته',
};

export async function generateMetadata(): Promise<Metadata> {
  const { config } = await creditPageData();
  const description = installmentsDescription(config);
  return {
    title: TITLE,
    description,
    alternates: { canonical: PATH },
    openGraph: { type: 'website', url: PATH, title: TITLE, description, images: [OG_IMAGE] },
    twitter: { card: 'summary_large_image', title: TITLE, description, images: [OG_IMAGE.url] },
  };
}

export const revalidate = 300;

export default async function InstallmentsPage() {
  const { config, products, models, articles, heroImage } = await creditPageData();
  const methods = offeredMethods(config);
  const services = config.installments;
  const banners = hubBanners(config);
  const storePlans = storeCalculatorPlans(config);
  const calculatorPlans = [...storePlans, ...serviceCalculatorPlans(config)];
  const faq = installmentsFaq(config, installmentServiceNames(config));
  const crumbs = [
    { name: 'آیفونی‌ها', href: '/' },
    { name: 'آیفون قسطی', href: PATH },
  ];
  const cheque = planOf(config, 'CHEQUE');

  return (
    <CreditSelectionProvider initialMethod={methods[0] ?? null}>
      <div className="container-page space-y-14 py-5 md:py-8">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript([
            breadcrumbLd(crumbs),
            faqLd(faq),
            itemListLd(products, 'قیمت آیفون قسطی'),
          ])}
        />
        <div>
          <Breadcrumbs items={crumbs} />
          <CreditHero
            eyebrow="آیفون قسطی"
            title="خرید آیفون قسطی با چک و سفته"
            lead={
              <p>
                آیفون را قسطی بخر: با چک صیادی یا سفته
                {services.length > 0 ? ` یا سرویس‌های اعتباری ${installmentServiceNames(config)}` : ''}.{' '}
                {cheque.enabled ? `در خرید با چک، ${planSummary(cheque)}. ` : ''}
                قیمت اقساطی هر مدل را همین‌جا ببین، قسط ماهانه را حساب کن و درخواستت را بفرست؛ خرید گوشی قسطی
                غیرحضوری است و آیفون آکبند به همهٔ شهرهای ایران ارسال می‌شود.
              </p>
            }
            pills={[
              ...methods.map((method) => ({
                label: CREDIT_METHOD_LABELS[method],
                method,
                color: CREDIT_COLORS[method],
              })),
              ...services.map((term) => ({
                label: PAYMENT_METHOD_INFO[term.method].name,
                service: term.method,
                color: PAYMENT_METHOD_INFO[term.method].color,
              })),
            ]}
            phone={config.store.phone}
            requestLabel="درخواست خرید قسطی"
            calculator={calculatorPlans.length > 0}
            image={heroImage}
          />
        </div>

        {banners.length > 0 ? <BannerCarousel slides={banners} className="-mt-6" priority /> : null}

        <section>
          <SectionHeader
            eyebrow="Ways to pay"
            title="روش‌های خرید گوشی قسطی"
            description="هر روش شرایط، مدارک و مراحل خودش را دارد؛ روشی را که با شرایطت جور است انتخاب کن."
          />
          <CreditMethodCards config={config} />
        </section>

        {calculatorPlans.length > 0 && models.length > 0 ? (
          <section id="calculator" className="scroll-mt-24">
            <SectionHeader
              eyebrow="Calculator"
              title="محاسبهٔ قسط آیفون"
              description="روش پرداخت، مدل، پیش‌پرداخت و تعداد اقساط را انتخاب کن تا قسط ماهانه و جمع کل پرداختی را ببینی."
            />
            <CreditPlanCalculator plans={calculatorPlans} models={models} />
          </section>
        ) : null}

        <section id="prices" className="scroll-mt-24">
          <SectionHeader
            eyebrow="Prices"
            title="قیمت آیفون قسطی"
            description={
              storePlans.length > 0
                ? `قیمت نقد هر مدل و قسط ماهانه با ${storePlans.map((plan) => plan.name).join(' و ')}، با حداقل پیش‌پرداخت و بیشترین تعداد اقساط. قیمت‌ها از فهرست روز فروشگاه خوانده می‌شود.`
                : 'قیمت نقد هر مدل از فهرست روز فروشگاه؛ پیش‌پرداخت و مبلغ اقساط را کارشناس ما پس از بررسی اعلام می‌کند.'
            }
          />
          <ModelPriceTable models={models} plans={storePlans} caption="قیمت نقد و اقساطی مدل‌های آیفون" />
        </section>

        <section>
          <SectionHeader
            eyebrow="How it works"
            title="مراحل خرید آیفون قسطی"
            description="از انتخاب مدل تا تحویل گوشی آکبند؛ همه غیرحضوری."
          />
          <NumberedSteps steps={installmentSteps(config)} />
        </section>

        {methods.length > 0 ? (
          <section>
            <SectionHeader
              eyebrow="Compare"
              title="خرید قسطی با چک یا سفته؟"
              description="شرایط هر روش کنار هم، از همان ارقامی که در قرارداد نوشته می‌شود."
            />
            <CreditCompare config={config} />
          </section>
        ) : null}

        {services.length > 0 ? (
          <section>
            <SectionHeader eyebrow="Services" title="اقساط آنلاین با سرویس‌های اعتباری" />
            <ServiceCards services={services} />
          </section>
        ) : null}

        {methods.length > 0 ? (
          <section id="request" className="scroll-mt-24">
            <SectionHeader
              eyebrow="Request"
              title="درخواست خرید آیفون قسطی"
              description="نام و شماره‌ات را بگذار؛ کارشناس فروش تماس می‌گیرد، شرایط دقیق را می‌گوید و قرارداد را هماهنگ می‌کند."
            />
            <CreditRequestForm
              models={models}
              methods={methods}
              defaultMethod={methods[0]!}
              source={PATH}
              approvalTime={config.credit.approvalTime}
              phone={config.store.phone}
            />
          </section>
        ) : null}

        <RelatedArticles
          articles={articles}
          title="راهنمای خرید قسطی از مجلهٔ آیفونی‌ها"
          prefer={[
            'installment-phone-buying-guide',
            'iphone-installment-calculation',
            'buy-iphone-with-sayad-cheque',
          ]}
        />

        <section>
          <SectionHeader eyebrow="FAQ" title="سؤال‌های متداول خرید آیفون قسطی" />
          <FaqSection items={faq} />
          <p className="mt-4 text-[11px] text-muted">
            قیمت‌ها و شرایط این صفحه از تنظیمات روز فروشگاه خوانده می‌شود؛ به‌روزرسانی: {todayFa()}
          </p>
        </section>
      </div>
    </CreditSelectionProvider>
  );
}
