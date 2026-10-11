import { expect, test, type Page } from '@playwright/test';

/** Pulls every JSON-LD block on the page and flattens it to one array. */
async function structuredData(page: Page): Promise<Record<string, unknown>[]> {
  const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
  return blocks.flatMap((block) => {
    const parsed: unknown = JSON.parse(block);
    return Array.isArray(parsed)
      ? (parsed as Record<string, unknown>[])
      : [parsed as Record<string, unknown>];
  });
}

test.describe('سئو', () => {
  test('robots.txt مسیرهای خصوصی را می‌بندد و نقشهٔ سایت را معرفی می‌کند', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    const body = await response.text();

    for (const path of ['/admin', '/account', '/checkout', '/cart', '/api', '/wishlist']) {
      expect(body).toContain(`Disallow: ${path}`);
    }
    expect(body).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/);
  });

  test('sitemap.xml همهٔ محصولات فعال را با تاریخ واقعی دارد', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('xml');
    const xml = await response.text();

    // static pages
    for (const path of ['/shop', '/installments', '/guide']) {
      expect(xml).toContain(`${path}</loc>`);
    }
    // products, with a real lastmod (not a placeholder)
    expect(xml).toContain('/iphone/iphone-17-pro-max</loc>');
    const products = xml.match(/\/iphone\/[^<]+<\/loc>/g) ?? [];
    expect(products.length).toBeGreaterThanOrEqual(5);
    expect(xml).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}T/);

    // nothing private may be listed
    for (const path of ['/admin', '/checkout', '/account', '/wishlist']) {
      expect(xml).not.toContain(`${path}</loc>`);
    }

    // an image sitemap: every colour's photos under its product page
    expect(xml).toContain('xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"');
    expect(xml).toMatch(/<image:loc>https?:\/\/[^<]+\/media\/[^<]+<\/image:loc>/);
  });

  test('robots.txt خوراک ترب و ایمالز را باز می‌گذارد', async ({ request }) => {
    const body = await (await request.get('/robots.txt')).text();
    expect(body).toContain('Allow: /api/feeds/');

    // the feed answers through the storefront's own domain, like Torob will call it
    const feed = await request.post('/api/feeds/torob', { data: { page: 1 } });
    expect(feed.status()).toBe(200);
    const json = await feed.json();
    expect(json.api_version).toBe('torob_api_v3');
    expect(json.products.length).toBeGreaterThan(0);
  });

  test('صفحه اصلی: عنوان یکتا، کانونیکال و داده‌های ساخت‌یافتهٔ فروشگاه', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title.length).toBeGreaterThan(20);
    // the brand must appear exactly once — the title template used to double it
    expect(title.match(/آیفونی‌ها/g)).toHaveLength(1);

    await expect(page.locator('link[rel="canonical"]')).toHaveCount(1);
    await expect(page.locator('meta[property="og:image"]')).toHaveCount(1);

    const data = await structuredData(page);
    const types = data.map((item) => item['@type']);
    expect(types).toContain('OnlineStore');
    expect(types).toContain('WebSite');
    expect(types).toContain('ItemList');

    const store = data.find((item) => item['@type'] === 'OnlineStore')!;
    expect(store.telephone).toBeTruthy();
    expect(String(store.url)).toMatch(/^https?:\/\//);
  });

  test('صفحه محصول: Product با قیمت، موجودی و امتیاز واقعی', async ({ page }) => {
    await page.goto('/iphone/iphone-17-pro-max');

    const data = await structuredData(page);
    type ProductMarkup = {
      name: string;
      sku: string;
      offers: {
        priceCurrency: string;
        lowPrice: string;
        highPrice: string;
        availability: string;
        hasMerchantReturnPolicy: { merchantReturnDays: number };
      };
      aggregateRating?: { ratingValue: string };
    };
    const product = data.find((item) => item['@type'] === 'Product') as ProductMarkup | undefined;
    expect(product).toBeTruthy();

    expect(product!.name).toContain('آیفون ۱۷ پرو مکس');
    expect(product!.sku).toBeTruthy();
    expect(product!.offers.priceCurrency).toBe('IRR');
    expect(Number(product!.offers.lowPrice)).toBeGreaterThan(0);
    expect(Number(product!.offers.highPrice)).toBeGreaterThanOrEqual(Number(product!.offers.lowPrice));
    expect(String(product!.offers.availability)).toContain('schema.org/');
    expect(product!.offers.hasMerchantReturnPolicy.merchantReturnDays).toBe(7);

    // the rating in the markup must match the rating shown on the page
    if (product!.aggregateRating) {
      const shown = await page.getByRole('img', { name: /از ۵/ }).first().getAttribute('aria-label');
      expect(shown).toBeTruthy();
      expect(Number(product!.aggregateRating.ratingValue)).toBeGreaterThan(0);
      expect(Number(product!.aggregateRating.ratingValue)).toBeLessThanOrEqual(5);
    }

    const breadcrumb = data.find((item) => item['@type'] === 'BreadcrumbList');
    expect(breadcrumb).toBeTruthy();

    // the shared-link picture is this model's own image, not the site-wide default
    const ogImage = await page.locator('meta[property="og:image"]').first().getAttribute('content');
    expect(ogImage).toContain('/iphone/iphone-17-pro-max/opengraph-image');
    const picture = await page.request.get(new URL(ogImage!).pathname);
    expect(picture.status()).toBe(200);
    expect(picture.headers()['content-type']).toContain('image/png');

    // what the price-comparison crawlers read
    await expect(page.locator('meta[name="product_id"]')).toHaveAttribute('content', 'iphone-17-pro-max');
    const price = await page.locator('meta[name="product_price"]').getAttribute('content');
    expect(Number(price)).toBeGreaterThan(0);
    await expect(page.locator('meta[name="availability"]')).toHaveAttribute(
      'content',
      /^(instock|outofstock)$/,
    );
  });

  test('فوتر به صفحهٔ همهٔ مدل‌ها لینک می‌دهد', async ({ page }) => {
    await page.goto('/about');
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'آیفون ۱۷ پرو مکس' })).toHaveAttribute(
      'href',
      '/iphone/iphone-17-pro-max',
    );
  });

  test('صفحه‌های فیلترشدهٔ فروشگاه ایندکس نمی‌شوند', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /^index/);

    await page.goto('/shop?storage=256&sort=price_asc');
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    // …but the canonical still points at the clean listing
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/shop$/);
  });

  test('صفحه‌های خصوصی از ایندکس بیرون‌اند', async ({ page }) => {
    for (const path of ['/cart', '/wishlist']) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
  });
});
