import { availabilityOf, imageForColor, toProductCard, toVariantDto } from '../catalog.mapper';
import type { ProductWithRelations, VariantWithRelations } from '../catalog.types';

const color = (id: string, code: string) => ({
  id,
  code,
  name: code,
  nameEn: code,
  hex: '#000000',
  finish: null,
  aliases: [],
  sortOrder: 0,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const storage = (id: string, gb: number) => ({
  id,
  capacityGb: gb,
  label: `${gb}GB`,
  labelFa: `${gb} گیگابایت`,
  sortOrder: gb,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const variant = (overrides: Partial<VariantWithRelations> = {}): VariantWithRelations =>
  ({
    id: 'v1',
    productId: 'p1',
    colorId: 'c1',
    storageId: 's1',
    sku: 'SKU-1',
    price: BigInt(100_000_000),
    compareAtPrice: BigInt(110_000_000),
    discountPercent: 9,
    shippingTime: 'SAME_DAY',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    color: color('c1', 'black'),
    storage: storage('s1', 256),
    inventory: {
      id: 'i1',
      variantId: 'v1',
      stock: 5,
      reserved: 2,
      sold: 0,
      lowStockThreshold: 2,
      updatedAt: new Date(),
    },
    ...overrides,
  }) as VariantWithRelations;

describe('catalog mapper', () => {
  it('computes availability from stock and reservations', () => {
    expect(availabilityOf(variant())).toEqual({ stock: 5, reserved: 2, available: 3 });
    const dto = toVariantDto(variant());
    expect(dto).toMatchObject({
      availableStock: 3,
      stockStatus: 'IN_STOCK',
      shippingTimeLabel: 'ارسال امروز',
    });
  });

  it('marks low and out of stock variants', () => {
    const low = toVariantDto(
      variant({
        inventory: { ...variant().inventory!, stock: 3, reserved: 2 },
      } as Partial<VariantWithRelations>),
    );
    expect(low.stockStatus).toBe('LOW_STOCK');

    const out = toVariantDto(
      variant({
        inventory: { ...variant().inventory!, stock: 2, reserved: 2 },
      } as Partial<VariantWithRelations>),
    );
    expect(out.stockStatus).toBe('OUT_OF_STOCK');
    expect(out.availableStock).toBe(0);
  });

  it('prefers the image of the selected colour', () => {
    const images = [
      { id: 'i1', colorId: null, url: '/media/shared.webp' },
      { id: 'i2', colorId: 'c2', url: '/media/blue.webp' },
    ] as never[];
    expect(imageForColor(images, 'c2')!.url).toBe('/media/blue.webp');
    expect(imageForColor(images, 'unknown')!.url).toBe('/media/shared.webp');
    expect(imageForColor([], 'c2')).toBeNull();
  });

  it('builds a product card from the matched variant', () => {
    const cheap = variant({ id: 'v2', price: BigInt(90_000_000), color: color('c2', 'white') });
    const product = {
      id: 'p1',
      slug: 'iphone-test',
      name: 'آیفون تست',
      nameEn: 'iPhone Test',
      series: 'iPhone Test',
      releaseYear: 2026,
      ratingAvg: 4.5,
      ratingCount: 10,
      images: [],
      variants: [variant(), cheap],
    } as unknown as ProductWithRelations;

    const card = toProductCard(product, 'v2');
    expect(card.variant.id).toBe('v2');
    expect(card.minPrice).toBe(90_000_000);
    expect(card.colors).toHaveLength(2);
    expect(card.inStock).toBe(true);
    expect(card.maxDiscountPercent).toBe(9);
  });
});
