import { Injectable } from '@nestjs/common';
import type { ShippingMethod } from '@prisma/client';
import type { ShippingMethodDto } from '@iphoneha/shared';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Errors } from '../../common/errors';
import { toNumber } from '../../common/bigint';
import { SettingsService } from '../settings/settings.service';

export interface ShippingQuote {
  method: ShippingMethod;
  cost: number;
  isFree: boolean;
}

/**
 * Shipping cost calculators. Add a strategy here and reference it from
 * `ShippingMethod.calculator` — no other code has to change.
 */
export type ShippingCalculator = (input: {
  method: ShippingMethod;
  province: string | null;
  itemsTotal: number;
  freeShippingThreshold: number | null;
}) => { available: boolean; reason: string | null; cost: number };

const flat: ShippingCalculator = ({ method, itemsTotal, freeShippingThreshold }) => {
  const base = toNumber(method.baseCost);
  const threshold = method.freeThreshold ? toNumber(method.freeThreshold) : freeShippingThreshold;
  const free = threshold !== null && threshold > 0 && itemsTotal >= threshold;
  return { available: true, reason: null, cost: free ? 0 : base };
};

const cityCourier: ShippingCalculator = (input) => {
  const { method, province } = input;
  if (method.allowedProvinces.length && (!province || !method.allowedProvinces.includes(province))) {
    return { available: false, reason: 'این روش ارسال برای استان انتخابی فعال نیست', cost: 0 };
  }
  return flat(input);
};

const CALCULATORS: Record<string, ShippingCalculator> = { flat, city_courier: cityCourier };

@Injectable()
export class ShippingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: SettingsService,
  ) {}

  private calculate(
    method: ShippingMethod,
    province: string | null,
    itemsTotal: number,
    threshold: number | null,
  ) {
    const calculator = CALCULATORS[method.calculator] ?? flat;
    const result = calculator({ method, province, itemsTotal, freeShippingThreshold: threshold });
    if (method.allowedProvinces.length && (!province || !method.allowedProvinces.includes(province))) {
      return { ...result, available: false, reason: 'این روش ارسال برای استان انتخابی فعال نیست' };
    }
    return result;
  }

  async listForCart(province: string | null, itemsTotal: number): Promise<ShippingMethodDto[]> {
    const [methods, commerce] = await Promise.all([
      this.prisma.shippingMethod.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } }),
      this.settings.get('commerce'),
    ]);
    return methods.map((method) => {
      const result = this.calculate(method, province, itemsTotal, commerce.freeShippingThreshold);
      return {
        id: method.id,
        code: method.code,
        name: method.name,
        description: method.description,
        etaLabel: method.etaLabel,
        cost: result.cost,
        isFree: result.cost === 0,
        available: result.available,
        unavailableReason: result.reason,
      };
    });
  }

  async quote(methodId: string, province: string | null, itemsTotal: number): Promise<ShippingQuote> {
    const [method, commerce] = await Promise.all([
      this.prisma.shippingMethod.findUnique({ where: { id: methodId } }),
      this.settings.get('commerce'),
    ]);
    if (!method || !method.isActive)
      throw Errors.badRequest('INVALID_SHIPPING', 'روش ارسال انتخابی معتبر نیست');
    const result = this.calculate(method, province, itemsTotal, commerce.freeShippingThreshold);
    if (!result.available) {
      throw Errors.badRequest('SHIPPING_UNAVAILABLE', result.reason ?? 'این روش ارسال در دسترس نیست');
    }
    return { method, cost: result.cost, isFree: result.cost === 0 };
  }

  async defaultMethodId(province: string | null, itemsTotal: number): Promise<string | null> {
    const methods = await this.listForCart(province, itemsTotal);
    return methods.find((m) => m.available)?.id ?? null;
  }
}
