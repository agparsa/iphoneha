import { z } from 'zod';
import { normalizePhone } from '../phone';
import { toLatinDigits } from '../digits';

export const idSchema = z.string().trim().min(1).max(64);

/** Accepts any Iranian mobile format and outputs `09xxxxxxxxx`. */
export const phoneSchema = z
  .string({ error: 'شماره موبایل را وارد کنید' })
  .trim()
  .transform((v, ctx) => {
    const p = normalizePhone(v);
    if (!p) {
      ctx.addIssue({ code: 'custom', message: 'شماره موبایل معتبر نیست' });
      return z.NEVER;
    }
    return p;
  });

/** Integer from a query-string value. */
export const intFromQuery = (min: number, max: number, fallback: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' || v === null ? fallback : Number(v)),
    z.number().int().min(min).max(max),
  );

export const optionalIntFromQuery = (min: number, max: number) =>
  z.preprocess(
    (v) => (v === undefined || v === '' || v === null ? undefined : Number(toLatinDigits(String(v)))),
    z.number().int().min(min).max(max).optional(),
  );

/** "true" | "1" → true, "false" | "0" → false, missing → undefined */
export const boolFromQuery = z.preprocess((v) => {
  if (v === undefined || v === '' || v === null) return undefined;
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1';
}, z.boolean().optional());

/** "a,b,c" | ["a","b"] → string[] */
export const csvFromQuery = z.preprocess(
  (v) => {
    if (v === undefined || v === null || v === '') return [];
    const arr = Array.isArray(v) ? v : String(v).split(',');
    return arr.map((s) => String(s).trim()).filter(Boolean);
  },
  z.array(z.string().max(64)).max(30),
);

export const paginationQuerySchema = z.object({
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/** Money in Toman (non-negative integer, up to 10 billion). */
export const tomanSchema = z.coerce
  .number({ error: 'مبلغ معتبر نیست' })
  .int('مبلغ باید عدد صحیح باشد')
  .min(0, 'مبلغ نمی‌تواند منفی باشد')
  .max(10_000_000_000);

export const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'اسلاگ فقط حروف انگلیسی کوچک، عدد و خط تیره');
