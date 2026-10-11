import { z } from 'zod';
import { toLatinDigits } from '../digits';
import { phoneSchema } from './common';

const personName = (label: string) =>
  z
    .string({ error: `${label} را وارد کنید` })
    .trim()
    .min(2, `${label} حداقل ۲ حرف باشد`)
    .max(50, `${label} حداکثر ۵۰ حرف باشد`);

export const updateProfileSchema = z.object({
  firstName: personName('نام'),
  lastName: personName('نام خانوادگی'),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const postalCodeSchema = z
  .string({ error: 'کد پستی را وارد کنید' })
  .trim()
  .transform((v) => toLatinDigits(v).replace(/[\s-]/g, ''))
  .pipe(z.string().regex(/^\d{10}$/, 'کد پستی ۱۰ رقمی معتبر نیست'));

export const addressSchema = z.object({
  title: z.string().trim().max(40).optional().nullable(),
  recipientName: z
    .string({ error: 'نام گیرنده را وارد کنید' })
    .trim()
    .min(3, 'نام گیرنده حداقل ۳ حرف باشد')
    .max(80),
  mobile: phoneSchema,
  province: z.string({ error: 'استان را انتخاب کنید' }).trim().min(2, 'استان را انتخاب کنید').max(40),
  city: z.string({ error: 'شهر را وارد کنید' }).trim().min(2, 'شهر را وارد کنید').max(60),
  addressLine: z
    .string({ error: 'آدرس کامل را وارد کنید' })
    .trim()
    .min(10, 'آدرس کامل‌تر بنویسید')
    .max(400, 'آدرس حداکثر ۴۰۰ حرف'),
  postalCode: postalCodeSchema,
  plaque: z.string().trim().max(20).optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),
  notes: z.string().trim().max(300).optional().nullable(),
  isDefault: z.boolean().optional(),
});
export type AddressInput = z.infer<typeof addressSchema>;
