import { z } from 'zod';
import { ARTICLE_STATUSES, CREDIT_METHODS, CREDIT_REQUEST_STATUSES } from '../enums';
import { intFromQuery, phoneSchema, slugSchema } from './common';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((value) => (value ? value : null));

/** «درخواست خرید قسطی با چک یا سفته» from the storefront. */
export const createCreditRequestSchema = z.object({
  name: z.string({ error: 'نامت را بنویس' }).trim().min(2, 'نام و نام خانوادگی را کامل بنویس').max(60),
  phone: phoneSchema,
  city: optionalText(40),
  method: z.enum(CREDIT_METHODS, { error: 'روش پرداخت را انتخاب کن' }),
  productSlug: slugSchema.optional().nullable(),
  months: z.coerce.number().int().min(1).max(36).optional().nullable(),
  note: optionalText(300),
  /** the page the form was sent from */
  source: z
    .string()
    .trim()
    .max(120)
    .regex(/^\/[\w\-/]*$/, 'مسیر معتبر نیست')
    .optional()
    .nullable(),
  /** a field people never see; only bots fill it in */
  website: z.string().max(200).optional(),
});
export type CreateCreditRequestInput = z.infer<typeof createCreditRequestSchema>;

/**
 * For a partial update: text sets the field, '' or null clears it, and a key
 * that is left out stays undefined — so saving only the status keeps the note.
 */
const patchText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value || null));

export const updateCreditRequestSchema = z
  .object({
    status: z.enum(CREDIT_REQUEST_STATUSES).optional(),
    adminNote: patchText(500),
  })
  .refine((value) => value.status !== undefined || value.adminNote !== undefined, 'چیزی برای ذخیره نیست');
export type UpdateCreditRequestInput = z.infer<typeof updateCreditRequestSchema>;

export const creditRequestListQuerySchema = z.object({
  status: z.enum(CREDIT_REQUEST_STATUSES).optional(),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});
export type CreditRequestListQuery = z.infer<typeof creditRequestListQuerySchema>;

// ─── magazine ────────────────────────────────────────────────────────────────

export const upsertArticleSchema = z.object({
  slug: slugSchema,
  title: z.string().trim().min(5, 'عنوان کوتاه است').max(120),
  excerpt: z
    .string()
    .trim()
    .min(40, 'خلاصه دست‌کم ۴۰ نویسه باشد؛ همین متن زیر عنوان در گوگل دیده می‌شود')
    .max(300),
  body: z.string().trim().min(200, 'متن مقاله کوتاه است').max(60_000),
  seoTitle: optionalText(70),
  focusKeyword: optionalText(80),
  coverAlt: optionalText(140),
  status: z.enum(ARTICLE_STATUSES),
});
export type UpsertArticleInput = z.infer<typeof upsertArticleSchema>;

export const articleListQuerySchema = z.object({
  page: intFromQuery(1, 1000, 1),
  pageSize: intFromQuery(1, 50, 12),
});
