import { z } from 'zod';
import { idSchema } from './common';

export const addToCartSchema = z.object({
  variantId: idSchema,
  quantity: z.coerce.number().int().min(1, 'حداقل تعداد ۱ است').max(20).default(1),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z.coerce.number().int().min(1, 'حداقل تعداد ۱ است').max(20),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const couponCodeSchema = z
  .string({ error: 'کد تخفیف را وارد کنید' })
  .trim()
  .min(3, 'کد تخفیف معتبر نیست')
  .max(32)
  .transform((v) => v.toUpperCase());

export const applyCouponSchema = z.object({ code: couponCodeSchema });
