import { resetDb, setStock } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

describe('Catalog', () => {
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

  it('lists products with a matched variant and facets', async () => {
    const response = await ctx.http().get('/api/products?pageSize=3').expect(200);
    expect(response.body.total).toBeGreaterThan(0);
    expect(response.body.items).toHaveLength(3);
    const first = response.body.items[0];
    expect(first.variant).toMatchObject({ price: expect.any(Number), stockStatus: expect.any(String) });
    expect(first.colors.length).toBeGreaterThan(0);
    expect(response.body.facets.storages.length).toBeGreaterThan(0);
    expect(response.body.facets.priceRange.min).toBeGreaterThan(0);
  });

  it('filters by storage, colour, price and availability', async () => {
    const byStorage = await ctx.http().get('/api/products?storage=1024').expect(200);
    for (const item of byStorage.body.items) expect(item.variant.storage.capacityGb).toBe(1024);

    const byColor = await ctx.http().get('/api/products?color=cosmic-orange').expect(200);
    expect(byColor.body.total).toBeGreaterThan(0);
    for (const item of byColor.body.items) expect(item.variant.color.code).toBe('cosmic-orange');

    const cheap = await ctx.http().get('/api/products?maxPrice=100000000').expect(200);
    for (const item of cheap.body.items) expect(item.variant.price).toBeLessThanOrEqual(100_000_000);

    const inStock = await ctx.http().get('/api/products?inStock=true').expect(200);
    for (const item of inStock.body.items) expect(item.variant.availableStock).toBeGreaterThan(0);
  });

  it('sorts by price and by discount', async () => {
    const asc = await ctx.http().get('/api/products?sort=price_asc&pageSize=10').expect(200);
    const prices = asc.body.items.map((i: { variant: { price: number } }) => i.variant.price);
    expect([...prices].sort((a, b) => a - b)).toEqual(prices);

    const discounted = await ctx.http().get('/api/products?sort=discount_desc&discounted=true').expect(200);
    const discounts = discounted.body.items.map(
      (i: { variant: { discountPercent: number } }) => i.variant.discountPercent,
    );
    expect([...discounts].sort((a, b) => b - a)).toEqual(discounts);
    for (const value of discounts) expect(value).toBeGreaterThan(0);
  });

  it('searches by model, capacity and colour together', async () => {
    const byModel = await ctx.http().get('/api/products?q=iphone+17+pro+max').expect(200);
    expect(byModel.body.items.map((i: { slug: string }) => i.slug)).toEqual(['iphone-17-pro-max']);

    const byPersian = await ctx
      .http()
      .get(`/api/products?q=${encodeURIComponent('آیفون ۱۶')}`)
      .expect(200);
    expect(byPersian.body.total).toBeGreaterThan(0);

    const combined = await ctx.http().get('/api/products?q=512%20silver').expect(200);
    for (const item of combined.body.items) {
      expect(item.variant.storage.capacityGb).toBe(512);
      expect(item.variant.color.code).toBe('silver');
    }
  });

  it('returns the product detail with variants, images and breadcrumbs', async () => {
    const response = await ctx.http().get('/api/products/iphone-17-pro-max').expect(200);
    expect(response.body.name).toBe('آیفون ۱۷ پرو مکس');
    expect(response.body.variants.length).toBe(7);
    expect(response.body.images.length).toBeGreaterThan(0);
    // every crumb must be a page that exists (there is no /iphone index)
    expect(response.body.breadcrumbs.map((crumb: { href: string }) => crumb.href)).toEqual([
      '/',
      '/shop',
      `/shop?series=${encodeURIComponent('iPhone 17')}`,
      '/iphone/iphone-17-pro-max',
    ]);
    expect(response.body.defaultVariantId).toBeTruthy();
    expect(response.body.seoTitle).toContain('آیفون');
    const outOfStock = response.body.variants.find((v: { availableStock: number }) => v.availableStock === 0);
    expect(outOfStock.stockStatus).toBe('OUT_OF_STOCK');
  });

  it('serves fresh stock from the variants endpoint after a change', async () => {
    const detail = await ctx.http().get('/api/products/iphone-17').expect(200);
    const variant = detail.body.variants[0];
    await setStock(ctx.prisma, variant.id, 1);
    const variants = await ctx.http().get('/api/products/iphone-17/variants').expect(200);
    const updated = variants.body.find((v: { id: string }) => v.id === variant.id);
    expect(updated.availableStock).toBe(1);
    expect(updated.stockStatus).toBe('LOW_STOCK');
  });

  it('suggests products for autocomplete', async () => {
    const response = await ctx.http().get('/api/products/search/suggest?q=pro&limit=3').expect(200);
    expect(response.body.length).toBeGreaterThan(0);
    expect(response.body[0]).toMatchObject({ slug: expect.any(String), href: expect.any(String) });
  });

  it('returns 404 for unknown or inactive products', async () => {
    await ctx.http().get('/api/products/does-not-exist').expect(404);
    await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: false } });
    await ctx.http().get('/api/products/iphone-16').expect(404);
    await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: true } });
  });

  it('exposes catalog metadata for filters', async () => {
    const response = await ctx.http().get('/api/catalog/meta').expect(200);
    expect(response.body.colors.length).toBeGreaterThan(0);
    expect(response.body.storages.map((s: { capacityGb: number }) => s.capacityGb)).toContain(256);
    expect(response.body.shippingTimes.length).toBe(5);
  });
});
