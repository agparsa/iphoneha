import { z } from 'zod';
import { toLatinDigits } from '../digits';
import { phoneSchema } from './common';

export const sendOtpSchema = z.object({ phone: phoneSchema });
export type SendOtpInput = z.infer<typeof sendOtpSchema>;

export const otpCodeSchema = z
  .string({ error: 'کد تأیید را وارد کنید' })
  .trim()
  .transform((v) => toLatinDigits(v))
  .pipe(z.string().regex(/^\d{4,8}$/, 'کد تأیید معتبر نیست'));

export const verifyOtpSchema = z.object({
  phone: phoneSchema,
  code: otpCodeSchema,
});
export type VerifyOtpInput = z.infer<typeof verifyOtpSchema>;
