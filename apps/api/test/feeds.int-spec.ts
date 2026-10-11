import { resetDb, setStock } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

interface Item {
  page_unique: string;
  page_url: string;
  title: string;
  subtitle: string;
  current_price: number;
  old_price: number | null;
  availability: string;
  image_link: string | null;
  image_links: string[];
  spec: Record<string, string> | Record<string, string>[];
  guarantee: string;
  registry: string;
  date_added: string;
  date_updated: string;
}

describe('Price-comparison feeds', () => {
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

  /** What is actually on sale: active models × their active, priced colours and capacities. */
  async function onSale() {
    return ctx.prisma.productVariant.findMany({
      where: { isActive: true, price: { gt: 0 }, product: { isActive: true } },
      include: { inventory: true, product: true, color: true, storage: true },
    });
  }

  it('lists every colour × capacity on sale in the Torob API v3 format', async () => {
    const variants = await onSale();
    // Torob posts JSON without a session or CSRF token
    const response = await ctx.http().post('/api/feeds/torob').send({ page: 1 }).expect(200);
    const { body } = response;
    // a feed is for the comparison sites, never a search result
    expect(response.headers['x-robots-tag']).toBe('noindex');

    expect(body).toMatchObject({ api_version: 'torob_api_v3', current_page: 1, max_pages: 1 });
    expect(body.total).toBe(variants.length);
    expect(body.products).toHaveLength(variants.length);

    for (const item of body.products as Item[]) {
      const variant = variants.find((v) => v.sku === item.page_unique)!;
      expect(variant).toBeTruthy();
      expect(item.current_price).toBe(Number(variant.price));
      const available = (variant.inventory?.stock ?? 0) - (variant.inventory?.reserved ?? 0) > 0;
      expect(item.availability).toBe(available ? 'instock' : 'outofstock');
      // the link opens the product page on exactly this colour and capacity
      const url = new URL(item.page_url);
      expect(url.pathname).toBe(`/iphone/${variant.product.slug}`);
      expect(url.searchParams.get('color')).toBe(variant.color.code);
      expect(url.searchParams.get('storage')).toBe(String(variant.storage.capacityGb));
      expect(item.title).toContain(variant.product.name);
      expect(item.subtitle).toBe(
        `Apple ${variant.product.nameEn} ${variant.storage.label} ${variant.color.nameEn}`,
      );
      if (item.old_price !== null) expect(item.old_price).toBeGreaterThan(item.current_price);
      expect(item.image_links.length).toBeGreaterThan(0);
      for (const image of item.image_links) expect(image).toMatch(/^https?:\/\/[^/]+\/media\//);
      expect(item.spec).toMatchObject({ رنگ: variant.color.name });
      expect(item.guarantee).toBeTruthy();
      expect(Number.isNaN(Date.parse(item.date_updated))).toBe(false);
    }
  });

  it('never lists a hidden model or a colour taken off sale', async () => {
    const [variant] = await onSale();
    await ctx.prisma.productVariant.update({ where: { id: variant!.id }, data: { isActive: false } });
    await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: false } });
    try {
      const { body } = await ctx.http().post('/api/feeds/torob').send({}).expect(200);
      const skus = body.products.map((item: Item) => item.page_unique);
      expect(skus).not.toContain(variant!.sku);
      for (const item of body.products as Item[]) expect(item.page_url).not.toContain('/iphone/iphone-16?');
    } finally {
      await ctx.prisma.productVariant.update({ where: { id: variant!.id }, data: { isActive: true } });
      await ctx.prisma.product.update({ where: { slug: 'iphone-16' }, data: { isActive: true } });
    }
  });

  it('puts the latest stock change first when asked for date_updated_desc', async () => {
    const variants = await onSale();
    const changed = variants[variants.length - 1]!;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await setStock(ctx.prisma, changed.id, 0);

    const { body } = await ctx
      .http()
      .post('/api/feeds/torob')
      .send({ sort: 'date_updated_desc' })
      .expect(200);
    expect(body.products[0].page_unique).toBe(changed.sku);
    expect(body.products[0].availability).toBe('outofstock');
  });

  it('looks pages up by address or by SKU, however the address is written', async () => {
    const { body: all } = await ctx.http().post('/api/feeds/torob').send({}).expect(200);
    const item = (all.products as Item[]).find((i) => i.page_url.includes('iphone-17-pro-max'))!;
    const url = new URL(item.page_url);
    // www., the parameters swapped and a trailing slash still find the same page
    const rewritten = `${url.protocol}//www.${url.host}${url.pathname}/?storage=${url.searchParams.get(
      'storage',
    )}&color=${url.searchParams.get('color')}`;

    const byUrl = await ctx
      .http()
      .post('/api/feeds/torob')
      .send({ page_urls: [rewritten] })
      .expect(200);
    expect(byUrl.body.products.map((i: Item) => i.page_unique)).toEqual([item.page_unique]);

    const byUnique = await ctx
      .http()
      .post('/api/feeds/torob')
      .send({ page_uniques: [item.page_unique] })
      .expect(200);
    expect(byUnique.body).toMatchObject({ total: 1, current_page: 1, max_pages: 1 });

    // the bare product page stands for all of its colours and capacities
    const bare = await ctx
      .http()
      .post('/api/feeds/torob')
      .send({ page_urls: [`${url.origin}${url.pathname}`] })
      .expect(200);
    const variants = (await onSale()).filter((v) => v.product.slug === 'iphone-17-pro-max');
    expect(bare.body.total).toBe(variants.length);

    const unknown = await ctx
      .http()
      .post('/api/feeds/torob')
      .send({ page_uniques: ['NOPE'] })
      .expect(200);
    expect(unknown.body).toMatchObject({ total: 0, products: [] });
  });

  it('answers a GET with query parameters and rejects nonsense', async () => {
    const { body } = await ctx.http().get('/api/feeds/torob?page=2').expect(200);
    expect(body.current_page).toBe(2);
    expect(body.products).toEqual([]);

    const invalid = await ctx.http().post('/api/feeds/torob').send({ sort: 'price' }).expect(400);
    expect(invalid.body.code).toBe('VALIDATION_ERROR');
  });

  it('serves the same catalogue in the Emalls extractor format, page by page', async () => {
    const variants = await onSale();
    const first = await ctx
      .http()
      .post('/api/feeds/emalls')
      .send({ page: 1, limit: 5, token: 'x' })
      .expect(200);
    expect(first.body.count).toBe(variants.length);
    expect(first.body.max_pages).toBe(Math.ceil(variants.length / 5));
    expect(first.body.products).toHaveLength(5);
    // Emalls wraps the spec sheet in a list
    expect(Array.isArray(first.body.products[0].spec)).toBe(true);

    const second = await ctx.http().post('/api/feeds/emalls').send({ page: 2, limit: 5 }).expect(200);
    const firstSkus = first.body.products.map((item: Item) => item.page_unique);
    for (const item of second.body.products as Item[]) expect(firstSkus).not.toContain(item.page_unique);
  });
});
