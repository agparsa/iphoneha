import { loginAdmin } from './utils/actors';
import { resetDb } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Storefront', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    await closeTestApp(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
  });

  it('serves the layout config: store info, instalment terms and models', async () => {
    const { body } = await ctx.http().get('/api/storefront/config').expect(200);

    expect(body.store).toMatchObject({ name: expect.any(String), phone: expect.any(String) });
    expect(body.commerce).toMatchObject({ maxQtyPerItem: expect.any(Number) });
    expect(body.installments.length).toBeGreaterThan(0);
    for (const term of body.installments) {
      expect(term).toMatchObject({
        method: expect.any(String),
        maxInstallments: expect.any(Number),
        minDownPaymentPercent: expect.any(Number),
      });
    }
    expect(body.models.map((m: { slug: string }) => m.slug)).toContain('iphone-17-pro-max');
    expect(body.series.length).toBeGreaterThan(0);
  });

  it('serves the home payload with hero, categories, featured and discounted products', async () => {
    const { body } = await ctx.http().get('/api/storefront/home').expect(200);

    expect(body.hero.length).toBeGreaterThan(0);
    const hero = body.hero[0];
    expect(hero).toMatchObject({
      id: expect.any(String),
      title: expect.any(String),
      href: expect.stringContaining('/iphone/'),
      price: expect.any(Number),
      monthly: expect.any(Number),
    });
    // the banner advertises a colour — the image must be that colour's photo
    if (hero.colorCode) expect(hero.image).toContain(hero.colorCode);
    expect(hero.product.slug).toBe(hero.href.replace('/iphone/', ''));

    expect(body.categories.length).toBeGreaterThan(0);
    expect(body.featured.length).toBeGreaterThan(0);
    for (const card of body.discounted) expect(card.variant.discountPercent).toBeGreaterThan(0);

    expect(body.stats.products).toBeGreaterThan(0);
    expect(body.stats.variants).toBeGreaterThan(0);
    expect(body.stats.installmentServices).toBeGreaterThan(0);
    // store-wide rating, weighted by each product's own rating count
    expect(body.stats.ratingAvg).toBeGreaterThan(0);
    expect(body.stats.ratingAvg).toBeLessThanOrEqual(5);
    expect(body.stats.ratingCount).toBeGreaterThan(0);
  });

  it('builds the comparison table from the products own spec sheets', async () => {
    const { body } = await ctx.http().get('/api/storefront/home').expect(200);

    const { products, rows } = body.compare;
    expect(products.length).toBeGreaterThan(1);
    for (const product of products) {
      expect(product).toMatchObject({
        slug: expect.any(String),
        href: expect.stringContaining('/iphone/'),
        price: expect.any(Number),
        monthly: expect.any(Number),
      });
    }

    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      // every row lines up with the columns and is defined by at least two models
      expect(row.values).toHaveLength(products.length);
      expect(row.values.filter((value: string | null) => value !== null).length).toBeGreaterThanOrEqual(2);
    }

    // the rows really are the products' own specs, not invented labels
    const detail = await ctx.http().get(`/api/products/${products[0].slug}`).expect(200);
    const keys = detail.body.specs.map((spec: { key: string }) => spec.key);
    for (const row of rows) {
      if (row.values[0] !== null) expect(keys).toContain(row.key);
    }
  });

  it('hides a payment service that was disabled in settings', async () => {
    const before = await ctx.http().get('/api/storefront/config').expect(200);
    expect(before.body.installments.map((t: { method: string }) => t.method)).toContain('TARA');

    const admin = await loginAdmin(ctx, '09120000000');
    await admin.agent
      .patch('/api/admin/settings/payments')
      .set('x-csrf-token', admin.csrf)
      .send({ disabledMethods: ['TARA'], installmentTerms: before.body.installments })
      .expect(200);

    const after = await ctx.http().get('/api/storefront/config').expect(200);
    expect(after.body.installments.map((t: { method: string }) => t.method)).not.toContain('TARA');
    expect(after.body.disabledMethods).toContain('TARA');
  });

  it('publishes the search-console codes and the analytics id set in the admin', async () => {
    const before = await ctx.http().get('/api/storefront/config').expect(200);
    // nothing is verified or tracked until the owner pastes his own codes
    expect(before.body.seo).toEqual({
      googleVerification: null,
      bingVerification: null,
      yandexVerification: null,
      ga4MeasurementId: null,
    });

    const admin = await loginAdmin(ctx, '09120000000');
    const patch = (body: object) =>
      admin.agent.patch('/api/admin/settings/seo').set('x-csrf-token', admin.csrf).send(body);
    try {
      const invalid = await patch({ ga4MeasurementId: 'UA-1234567-1' }).expect(400);
      expect(invalid.body.code).toBe('VALIDATION_ERROR');

      // the console's whole <meta> tag is accepted and reduced to its code
      await patch({
        googleVerification:
          '<meta name="google-site-verification" content="aB3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5z" />',
        ga4MeasurementId: 'g-ab12cd34ef',
      }).expect(200);

      const after = await ctx.http().get('/api/storefront/config').expect(200);
      expect(after.body.seo).toEqual({
        googleVerification: 'aB3_dE5-fG7hI9jK1lM3nO5pQ7rS9tU1vW3xY5z',
        bingVerification: null,
        yandexVerification: null,
        ga4MeasurementId: 'G-AB12CD34EF',
      });
      const settings = await admin.agent.get('/api/admin/settings').expect(200);
      expect(settings.body.seo.ga4MeasurementId).toBe('G-AB12CD34EF');
    } finally {
      await patch({}).expect(200);
    }
  });

  it('lists the models on sale with the photos a visitor can reach, for the image sitemap', async () => {
    const product = await ctx.prisma.product.findUniqueOrThrow({
      where: { slug: 'iphone-17-pro-max' },
      include: { images: true, variants: { where: { isActive: true }, select: { id: true, colorId: true } } },
    });
    const onSale = [...new Set(product.variants.map((variant) => variant.colorId))];
    // a colour taken off sale, with photos of its own
    const offSale = onSale.find((colorId) => product.images.some((image) => image.colorId === colorId));
    expect(offSale).toBeTruthy();
    const offSaleVariants = product.variants
      .filter((variant) => variant.colorId === offSale)
      .map((v) => v.id);

    await ctx.prisma.productVariant.updateMany({
      where: { id: { in: offSaleVariants } },
      data: { isActive: false },
    });
    await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: false } });
    try {
      const { body } = await ctx.http().get('/api/storefront/sitemap').expect(200);
      const slugs = body.products.map((entry: { slug: string }) => entry.slug);
      expect(slugs).toContain('iphone-17-pro-max');
      expect(slugs).not.toContain('iphone-16');
      expect(Number.isNaN(Date.parse(body.catalogUpdatedAt))).toBe(false);

      const entry = body.products.find((item: { slug: string }) => item.slug === 'iphone-17-pro-max');
      const reachable = product.images
        .filter(
          (image) => image.colorId === null || (image.colorId !== offSale && onSale.includes(image.colorId)),
        )
        .map((image) => image.url);
      expect([...entry.images].sort()).toEqual([...reachable].sort());
      expect(entry.images.length).toBeGreaterThan(0);
      for (const url of entry.images) expect(url).toMatch(/^\/media\//);
    } finally {
      await ctx.prisma.productVariant.updateMany({
        where: { id: { in: offSaleVariants } },
        data: { isActive: true },
      });
      await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: true } });
    }
  });

  // cPanel's nginx caches plain 200s for an hour, keyed on the URL alone: a
  // cacheable cart or profile response would leak to the next visitor.
  it('marks every API response no-store, except product images', async () => {
    for (const path of ['/api/health', '/api/cart', '/api/storefront/config', '/api/products']) {
      const response = await ctx.http().get(path);
      expect(response.headers['cache-control']).toBe('no-store');
    }

    const { body: product } = await ctx.http().get('/api/products/iphone-17-pro-max').expect(200);
    const imageUrl: string | undefined = product.images[0]?.url;
    expect(imageUrl).toBeTruthy();
    const mediaPath = imageUrl!.replace(/^.*\/media\//, '/api/media/');
    const image = await ctx.http().get(mediaPath).expect(200);
    expect(image.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });
});
