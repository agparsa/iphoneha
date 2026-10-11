import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import type { ShippingMethodDto } from '@iphoneha/shared';
import { ZodQuery } from '../../common/zod-validation.pipe';
import { ShippingService } from './shipping.service';

const querySchema = z.object({
  province: z.string().trim().max(40).optional(),
  subtotal: z.coerce.number().int().min(0).max(10_000_000_000).default(0),
});

@ApiTags('shipping')
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shipping: ShippingService) {}

  @Get('methods')
  methods(
    @Query(new ZodQuery(querySchema)) query: { province?: string; subtotal: number },
  ): Promise<ShippingMethodDto[]> {
    return this.shipping.listForCart(query.province ?? null, query.subtotal);
  }
}
