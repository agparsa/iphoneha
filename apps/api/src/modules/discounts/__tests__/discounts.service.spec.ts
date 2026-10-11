import type { Discount } from '@prisma/client';
import { DiscountsService } from '../discounts.service';

const discount = (overrides: Partial<Discount>): Discount =>
  ({
    id: 'd1',
    name: 'test',
    type: 'PERCENT',
    value: BigInt(10),
    maxDiscount: null,
    minOrderAmount: null,
    startsAt: null,
    endsAt: null,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  }) as Discount;

describe('discount amounts', () => {
  it('applies a percentage', () => {
    expect(DiscountsService.amountFor(discount({}), 100_000_000)).toBe(10_000_000);
  });

  it('respects the cap', () => {
    expect(DiscountsService.amountFor(discount({ maxDiscount: BigInt(3_000_000) }), 100_000_000)).toBe(
      3_000_000,
    );
  });

  it('applies a fixed amount', () => {
    expect(
      DiscountsService.amountFor(discount({ type: 'FIXED', value: BigInt(2_500_000) }), 100_000_000),
    ).toBe(2_500_000);
  });

  it('never exceeds the basket', () => {
    expect(DiscountsService.amountFor(discount({ type: 'FIXED', value: BigInt(50) }), 30)).toBe(30);
  });
});
