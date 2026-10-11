import { z } from 'zod';
import { PAYMENT_METHODS } from '../enums';
import { couponCodeSchema } from './cart';
import { idSchema } from './common';
import { addressSchema } from './user';

const destination = {
  addressId: idSchema.optional(),
  address: addressSchema.optional(),
};

const exactlyOneDestination = (v: { addressId?: string; address?: unknown }) =>
  Boolean(v.addressId) !== Boolean(v.address);

export const checkoutQuoteSchema = z.object({
  addressId: idSchema.optional(),
  province: z.string().trim().max(40).optional(),
  shippingMethodId: idSchema.optional(),
  couponCode: couponCodeSchema.optional(),
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;

export const createOrderSchema = z
  .object({
    ...destination,
    saveAddress: z.boolean().optional(),
    shippingMethodId: idSchema,
    paymentMethod: z.enum(PAYMENT_METHODS, { error: 'روش پرداخت را انتخاب کنید' }),
    couponCode: couponCodeSchema.optional(),
    notes: z.string().trim().max(500).optional(),
  })
  .refine(exactlyOneDestination, { message: 'آدرس ارسال را مشخص کنید', path: ['addressId'] });
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** POST /checkout = create order + start payment */
export const checkoutSchema = createOrderSchema;
export type CheckoutInput = CreateOrderInput;

export const createPaymentSchema = z.object({
  orderId: idSchema,
  method: z.enum(PAYMENT_METHODS).optional(),
});
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

export const verifyPaymentSchema = z.object({
  paymentId: idSchema,
});

export const idempotencyKeySchema = z
  .string({ error: 'Idempotency-Key header is required' })
  .trim()
  .min(8, 'Idempotency-Key is too short')
  .max(100)
  .regex(/^[A-Za-z0-9_\-:.]+$/, 'Invalid Idempotency-Key');
