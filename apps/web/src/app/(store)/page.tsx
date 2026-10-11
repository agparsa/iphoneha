import { Suspense, type CSSProperties } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft, Sparkles } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { getLatestArticles, getStorefrontConfig, getStorefrontHome } from '@/lib/api/endpoints';
import { homeBanners } from '@/lib/banners';
import { itemListLd, jsonLdScript } from '@/lib/seo';
import { installmentServiceNames, purchaseFaq } from '@/lib/store-copy';
import { PulseRing } from '@/components/motion/pulse-ring';
import { Button } from '@/components/ui/button';
import { BannerCarousel } from '@/components/store/banner-carousel';
import { CategoryRail } from '@/components/store/category-rail';
import { CheckPurchase } from '@/components/store/check-purchase';
import { CompareTable } from '@/components/store/compare-table';
import { FaqSection } from '@/components/store/faq-section';
import { GuideCards } from '@/components/store/guide-cards';
import { HeroCarousel } from '@/components/store/hero-carousel';
import { InstallmentStrip } from '@/components/store/installment-strip';
import { ProductRail } from '@/components/store/product-rail';
import { RatingsPanel } from '@/components/store/ratings-panel';
import { SectionHeader } from '@/components/store/section-header';
import { StatsBand } from '@/components/store/stats-band';
import { TrustStrip } from '@/components/store/trust-strip';
import { StoryBox } from '@/components/store/story-box';
import { RelatedArticles } from '@/components/mag/related-articles';
import { installmentStories } from '@/lib/stories';
import { telHref } from '@/lib/utils';

export async function generateMetadata(): Promise<Metadata> {
  const config = await getStorefrontConfig();
  const { warrantyMonths } = config.store;
  const payment =
    config.installments.length > 0
      ? `خرید آیفون قسطی با چک صیادی، سفته یا ${installmentServiceNames(config)}`
      : 'خرید آیفون قسطی با چک صیادی یا سفته';
  return {
    // absolute: the brand is already in the title, so the «| آیفونی‌ها» template
    // must not be appended a second time
    title: { absolute: 'آیفونی‌ها | خرید آیفون آکبند، نقد و قسطی با چک و سفته' },
    description: `خرید آیفون آکبند و اورجینال با ضمانت اصالت کالا${
      warrantyMonths > 0 ? ` و گارانتی ${formatNumberFa(warrantyMonths)} ماهه` : ''
    }؛ ${payment}، قرارداد غیرحضوری و ارسال به سراسر ایران.`,
    alternates: { canonical: '/', languages: { 'fa-IR': '/' } },
  };
}

export const revalidate = 60;

export default async function HomePage() {
  const [home, config, articles] = await Promise.all([
    getStorefrontHome(),
    getStorefrontConfig(),
    getLatestArticles(3),
  ]);
  const samplePrice = home.hero[0]?.price ?? home.featured[0]?.minPrice ?? 100_000_000;

  const listed = [...home.categories, ...home.featured];
  // «آیفون قسطی»، چک، سفته، each credit service that is live, and the magazine
  const stories = installmentStories({ config, hero: home.hero[0] ?? null, articles });
  // the store's own promissory-note plans and whichever credit services are on
  const banners = homeBanners(config);
  const ways = [
    config.credit.safte.enabled ? 'سفته' : null,
    config.credit.cheque.enabled ? 'چک صیادی' : null,
    config.installments.length > 0 ? `${formatNumberFa(config.installments.length)} سرویس اعتباری` : null,
  ].filter((way): way is string => way !== null);
  const waysText = ways.length > 1 ? `${ways.slice(0, -1).join('، ')} یا ${ways.at(-1)}` : (ways[0] ?? '');

  return (
    <div className="container-page space-y-14 py-5 md:space-y-20 md:py-8">
      {listed.length > 0 ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(itemListLd(listed, 'آیفون‌های موجود در آیفونی‌ها'))}
        />
      ) : null}

      <div className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h1 className="text-[15px] font-semibold leading-7 text-ink sm:text-base">
            خرید آیفون آکبند و اصل؛ نقد و قسطی با چک و سفته
          </h1>
          <p className="text-[12px] text-muted">
            ضمانت اصالت کالا · قرارداد اقساطی غیرحضوری · ارسال به سراسر ایران
          </p>
        </div>
        {/* above the fold, so rendered in the first bytes of the page: a streaming
            boundary here would arrive at the end of the document, shift everything
            below it and hold back the page's largest paint (the hero phone) */}
        <StoryBox groups={stories} />
        <HeroCarousel slides={home.hero} />
      </div>

      <TrustStrip />

      {/* buying in instalments is what most visitors come for: straight after the hero */}
      {banners.length > 0 || config.installments.length > 0 ? (
        <section className="cv-auto">
          <SectionHeader
            eyebrow="Installment"
            title="آیفونت را قسطی بخر"
            description={waysText ? `با ${waysText}؛ شرایط هر روش را ببین و همان‌جا شروع کن.` : undefined}
            href="/installments"
            linkLabel="همه روش‌ها"
          />
          {banners.length > 0 ? (
            <BannerCarousel
              slides={banners}
              className={config.installments.length > 0 ? 'mb-4' : undefined}
            />
          ) : null}
          {config.installments.length > 0 ? (
            <Suspense fallback={null}>
              <InstallmentStrip terms={config.installments} samplePrice={samplePrice} />
            </Suspense>
          ) : null}
        </section>
      ) : null}

      <section>
        <SectionHeader eyebrow="Lineup" title="جدیدترین آیفون‌ها" href="/shop" />
        <CategoryRail products={home.categories} />
      </section>

      {home.featured.length > 0 ? (
        <section className="cv-auto">
          <SectionHeader
            eyebrow="Best Sellers"
            title="محبوب‌ترین آیفون‌ها"
            description="رنگ دلخواهت را روی کارت انتخاب کن؛ قیمت و موجودی همان لحظه به‌روز می‌شود."
            href="/shop"
          />
          <Suspense fallback={null}>
            <ProductRail products={home.featured} />
          </Suspense>
        </section>
      ) : null}

      {home.discounted.length > 0 ? (
        <section className="cv-auto">
          <SectionHeader
            eyebrow="Offers"
            title="تخفیف‌های این هفته"
            href="/shop?discounted=true&sort=discount_desc"
            linkLabel="همه تخفیف‌ها"
          />
          <Suspense fallback={null}>
            <ProductRail products={home.discounted} />
          </Suspense>
        </section>
      ) : null}

      {home.compare.products.length > 1 ? (
        <section className="cv-auto">
          <SectionHeader
            eyebrow="Compare"
            title="مقایسه مدل‌ها"
            description="مشخصات کلیدی و قیمت شروع پرفروش‌ترین مدل‌ها را کنار هم ببین و راحت‌تر تصمیم بگیر."
            href="/shop"
            linkLabel="همه مدل‌ها"
          />
          <CompareTable data={home.compare} />
        </section>
      ) : null}

      <div className="cv-auto">
        <CheckPurchase phone={config.store.phone} />
      </div>

      {/* only real ratings from real buyers — the section waits until there are some */}
      {home.stats.ratingAvg && home.stats.ratingCount > 0 ? (
        <section className="cv-auto">
          <SectionHeader
            eyebrow="Ratings"
            title="امتیاز خریداران"
            description="امتیاز هر مدل از نظر خریداران همان مدل در آیفونی‌ها."
          />
          <RatingsPanel
            average={home.stats.ratingAvg}
            count={home.stats.ratingCount}
            products={[...home.featured, ...home.categories]}
          />
        </section>
      ) : null}

      <section className="cv-auto">
        <SectionHeader
          eyebrow="Guide"
          title="پیش از خرید بخوان"
          description="پاسخ کوتاه پرسش‌های مهم؛ برای جزئیات بیشتر وارد راهنمای خرید شو."
          href="/guide"
          linkLabel="راهنمای خرید"
        />
        <GuideCards config={config} />
      </section>

      <div className="cv-auto">
        <RelatedArticles articles={articles} title="راهنمای خرید آیفون قسطی از مجله" />
      </div>

      <section className="cv-auto grid gap-6 md:grid-cols-[1fr_1.4fr]">
        <div>
          <p className="eyebrow">FAQ</p>
          <h2 className="mt-3 text-xl font-semibold text-ink sm:text-2xl">سؤال‌های پرتکرار خرید</h2>
          <p className="mt-3 text-[13px] leading-7 text-muted">
            پاسخ پرتکرارترین پرسش‌ها درباره اقساط، گارانتی، بازگشت کالا و تحویل آیفون.
          </p>
          <Button asChild variant="outline" size="md" className="mt-5">
            <a href={telHref(config.store.phone)}>
              گفتگو با کارشناس
              <ArrowLeft className="size-4" aria-hidden />
            </a>
          </Button>
        </div>
        <FaqSection items={purchaseFaq(config)} />
      </section>

      <div className="cv-auto">
        <StatsBand stats={home.stats} store={config.store} />
      </div>

      <section className="cv-auto relative isolate overflow-hidden rounded-panel bg-brand-deep px-6 py-12 text-center text-white md:px-10">
        <span aria-hidden className="panel-grid absolute inset-0 -z-10" />
        <span
          aria-hidden
          className="animate-drift absolute -top-24 left-1/4 -z-10 size-80 rounded-full bg-brand/45 blur-3xl"
        />
        <span
          aria-hidden
          className="animate-drift-slow absolute -right-16 -bottom-28 -z-10 size-72 rounded-full bg-brand-mint/15 blur-3xl"
        />
        <h2 className="text-2xl font-semibold text-balance sm:text-3xl">
          آیفون مورد علاقه‌ات را امروز بخر، قسطی پرداخت کن.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[13px] leading-7 text-white/75">
          {formatNumberFa(home.stats.products)} مدل آیفون با {formatNumberFa(home.stats.variants)} ترکیب رنگ و
          حافظه، همه با ضمانت اصالت و امکان خرید اقساطی.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <PulseRing color="#bfe3d2">
            <Button
              asChild
              size="lg"
              className="shine relative bg-brand-mint text-brand-deep hover:-translate-y-0.5 hover:bg-white"
              style={{ '--shine': 'rgb(255 255 255 / 0.7)' } as CSSProperties}
            >
              <Link href="/shop">مشاهده محصولات</Link>
            </Button>
          </PulseRing>
          <Button
            asChild
            size="lg"
            variant="ghost"
            className="border border-white/20 text-white hover:bg-white/10"
          >
            <Link href="/installments">
              <Sparkles aria-hidden />
              روش‌های خرید قسطی
            </Link>
          </Button>
        </div>
      </section>
    </div>
  );
}
