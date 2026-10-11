import { execSync } from 'node:child_process';
import { CATALOG } from '../prisma/catalog/catalog';
import { syncCatalog } from '../prisma/catalog/sync';
import { loginAdmin, type Actor } from './utils/actors';
import { resetDb } from './utils/db';
import { closeTestApp, createTestApp, type TestContext } from './utils/test-app';

/**
 * The official catalogue is synced into a live store on every deploy. It adds
 * models, colours, capacities and Apple's photos — and must never change what
 * the owner decides: prices, stock, texts and photos they uploaded.
 */
describe('Catalogue sync', () => {
  let ctx: TestContext;
  let admin: Actor;

  beforeAll(async () => {
    ctx = await createTestApp();
  });
  afterAll(async () => {
    // the first tests rebuild iphone-18-pro unpriced: the seed prices its samples again
    execSync('npx tsx prisma/seed.ts', { stdio: 'ignore', env: process.env });
    await closeTestApp(ctx);
  });
  beforeEach(async () => {
    await resetDb(ctx.prisma, ctx.redis);
    admin = await loginAdmin(ctx, '09120000000');
  });

  const variantsOf = (slug: string) =>
    ctx.prisma.productVariant.findMany({
      where: { product: { slug } },
      include: { color: true, storage: true },
      orderBy: { sku: 'asc' },
    });

  it('adds a missing model unpriced and hidden, with every colour and capacity Apple sells', async () => {
    await ctx.prisma.product.delete({ where: { slug: 'iphone-18-pro' } });

    const report = await syncCatalog(ctx.prisma);
    expect(report.productsCreated).toEqual(['iphone-18-pro']);

    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-18-pro' } });
    expect(product).toMatchObject({ isActive: false, basePrice: 0n });
    const variants = await variantsOf('iphone-18-pro');
    const entry = CATALOG.find((p) => p.slug === 'iphone-18-pro')!;
    expect(variants).toHaveLength(entry.colors.length * entry.capacities.length);
    expect(variants.every((v) => v.price === 0n && !v.isActive)).toBe(true);

    // hidden from every storefront surface
    await ctx.http().get('/api/products/iphone-18-pro').expect(404);
    const list = await ctx.http().get('/api/products?pageSize=24').expect(200);
    expect(list.body.items.map((i: { slug: string }) => i.slug)).not.toContain('iphone-18-pro');
  });

  it('puts the model on sale with its first price, and nothing on sale without one', async () => {
    await ctx.prisma.product.delete({ where: { slug: 'iphone-18-pro' } });
    await syncCatalog(ctx.prisma);
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-18-pro' } });
    const [first, second] = (await variantsOf('iphone-18-pro')).filter(
      (v) => v.color.code === 'glacier' && [256, 512].includes(v.storage.capacityGb),
    );

    // switching a model on without a single priced colour/capacity is refused
    const early = await admin.agent
      .patch(`/api/admin/products/${product.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ isActive: true })
      .expect(400);
    expect(early.body.code).toBe('PRODUCT_NOT_PRICED');

    // …and so is showing a colour/capacity without a price
    const unpriced = await admin.agent
      .patch(`/api/admin/variants/${second!.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ isActive: true })
      .expect(400);
    expect(unpriced.body.code).toBe('VARIANT_NOT_PRICED');

    // the first price is all it takes
    await admin.agent
      .patch(`/api/admin/variants/${first!.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ price: 172_900_000 })
      .expect(200);

    const live = await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
    expect(live).toMatchObject({ isActive: true, basePrice: 172_900_000n });
    const detail = await ctx.http().get('/api/products/iphone-18-pro').expect(200);
    expect(detail.body.variants.map((v: { id: string }) => v.id)).toEqual([first!.id]);
    expect(detail.body.priceRange).toEqual({ min: 172_900_000, max: 172_900_000 });
    expect(detail.body.images.length).toBeGreaterThan(0);
  });

  it('never turns a model back on that the owner switched off after pricing it', async () => {
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-17' } });
    await admin.agent
      .patch(`/api/admin/products/${product.id}`)
      .set('x-csrf-token', admin.csrf)
      .send({ isActive: false })
      .expect(200);
    const unpriced = (await variantsOf('iphone-17')).find((v) => v.price === 0n)!;

    try {
      await admin.agent
        .patch(`/api/admin/variants/${unpriced.id}`)
        .set('x-csrf-token', admin.csrf)
        .send({ price: 99_000_000 })
        .expect(200);

      expect((await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } })).isActive).toBe(
        false,
      );
    } finally {
      await ctx.prisma.productVariant.update({
        where: { id: unpriced.id },
        data: { price: 0n, isActive: false },
      });
      await ctx.prisma.product.update({ where: { id: product.id }, data: { isActive: true } });
    }
  });

  it('leaves prices, stock, texts and the owner’s own photos alone, and a second run changes nothing', async () => {
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-17' } });
    const black = await ctx.prisma.color.findUniqueOrThrow({ where: { code: 'black' } });
    await ctx.prisma.product.update({
      where: { id: product.id },
      data: { name: 'آیفون ۱۷ (ویرایش من)', specs: [{ key: 'نمایشگر', value: 'متن خودم' }] },
    });
    await ctx.prisma.productImage.create({
      data: {
        productId: product.id,
        colorId: black.id,
        storageKey: `products/${product.id}/my-photo.webp`,
        url: `/media/products/${product.id}/my-photo.webp`,
        alt: 'عکس خودم',
      },
    });
    const catalogEntry = CATALOG.find((p) => p.slug === 'iphone-17')!;
    const restore = async () => {
      await ctx.prisma.productImage.deleteMany({
        where: { storageKey: { startsWith: `products/${product.id}/` } },
      });
      await ctx.prisma.product.update({
        where: { id: product.id },
        data: { name: catalogEntry.name, specs: catalogEntry.specs },
      });
    };
    const pricesBefore = (await variantsOf('iphone-17')).map((v) => [v.sku, v.price, v.isActive]);
    const blackBefore = await ctx.prisma.productImage.findMany({
      where: { productId: product.id, colorId: black.id },
    });

    try {
      const report = await syncCatalog(ctx.prisma);

      expect(report.imagesKept).toContain('iphone-17/black');
      expect(report.specsUpdated).not.toContain('iphone-17');
      const after = await ctx.prisma.product.findUniqueOrThrow({ where: { id: product.id } });
      expect(after.name).toBe('آیفون ۱۷ (ویرایش من)');
      expect(after.specs).toEqual([{ key: 'نمایشگر', value: 'متن خودم' }]);
      expect((await variantsOf('iphone-17')).map((v) => [v.sku, v.price, v.isActive])).toEqual(pricesBefore);
      const blackAfter = await ctx.prisma.productImage.findMany({
        where: { productId: product.id, colorId: black.id },
      });
      expect(blackAfter.map((i) => i.storageKey).sort()).toEqual(blackBefore.map((i) => i.storageKey).sort());

      const again = await syncCatalog(ctx.prisma);
      expect(again).toMatchObject({
        colorsCreated: [],
        productsCreated: [],
        variantsCreated: 0,
        specsUpdated: [],
        imagesUpdated: [],
      });
    } finally {
      await restore();
    }
  });

  it('replaces the generated mockup of an older seed with Apple’s photos, served by the API', async () => {
    const product = await ctx.prisma.product.findUniqueOrThrow({ where: { slug: 'iphone-16' } });
    const pink = await ctx.prisma.color.findUniqueOrThrow({ where: { code: 'pink' } });
    await ctx.prisma.productImage.deleteMany({ where: { productId: product.id, colorId: pink.id } });
    await ctx.prisma.productImage.create({
      data: {
        productId: product.id,
        colorId: pink.id,
        storageKey: 'products/iphone-16/pink.webp',
        url: '/media/products/iphone-16/pink.webp',
      },
    });

    const report = await syncCatalog(ctx.prisma);
    expect(report.imagesUpdated).toEqual(['iphone-16/pink']);

    const images = await ctx.prisma.productImage.findMany({
      where: { productId: product.id, colorId: pink.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(images.map((i) => i.kind)).toEqual(['DEVICE', 'DETAIL', 'DETAIL']);
    expect(images.every((i) => i.storageKey.startsWith('catalog/iphone-16/pink-'))).toBe(true);
    const file = await ctx.http().get(`/api${images[0]!.url}`).expect(200);
    expect(file.headers['content-type']).toContain('image/webp');
  });
});
