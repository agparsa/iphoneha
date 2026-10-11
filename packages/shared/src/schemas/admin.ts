import { z } from 'zod';
import {
  ADMIN_ROLES,
  DISCOUNT_TYPES,
  ORDER_PAYMENT_METHODS,
  ORDER_SOURCES,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  PRODUCT_IMAGE_KINDS,
  REGISTRY_STATUSES,
  SHIPPING_TIMES,
} from '../enums';
import { isIsoDate, parseJalaliInput } from '../jalali';
import { csvFromQuery, idSchema, intFromQuery, phoneSchema, slugSchema, tomanSchema } from './common';
import { couponCodeSchema } from './cart';

const text = (min: number, max: number, label = 'این فیلد') =>
  z
    .string({ error: `${label} را وارد کنید` })
    .trim()
    .min(min, `${label} خیلی کوتاه است`)
    .max(max, `${label} خیلی بلند است`);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === '' ? null : v));

// ─── Products ────────────────────────────────────────────────────────────────

export const productSpecSchema = z.object({
  key: text(1, 60, 'عنوان مشخصه'),
  value: text(1, 200, 'مقدار مشخصه'),
});

const productFields = {
  slug: slugSchema,
  name: text(2, 120, 'نام محصول'),
  nameEn: text(2, 120, 'نام انگلیسی'),
  model: text(2, 120, 'مدل'),
  series: text(2, 60, 'سری'),
  releaseYear: z.coerce.number().int().min(2007).max(2100),
  tagline: optionalText(160),
  shortDescription: optionalText(300),
  description: text(10, 10_000, 'توضیحات'),
  warranty: text(2, 160, 'گارانتی'),
  registryStatus: z.enum(REGISTRY_STATUSES),
  basePrice: tomanSchema,
  specs: z.array(productSpecSchema).max(60),
  isActive: z.boolean(),
  isFeatured: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(100_000),
  ratingAvg: z.coerce.number().min(0).max(5).optional().nullable(),
  ratingCount: z.coerce.number().int().min(0).max(10_000_000).optional(),
  seoTitle: optionalText(160),
  seoDescription: optionalText(320),
};

export const createProductSchema = z.object({
  ...productFields,
  specs: productFields.specs.default([]),
  isActive: productFields.isActive.default(true),
  isFeatured: productFields.isFeatured.default(false),
  sortOrder: productFields.sortOrder.default(0),
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z.object(productFields).partial();
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

export const adminProductListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(['active', 'inactive', 'all']).optional().default('all'),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});

// ─── Variants ────────────────────────────────────────────────────────────────

const skuSchema = z
  .string({ error: 'SKU را وارد کنید' })
  .trim()
  .min(3, 'SKU کوتاه است')
  .max(64)
  .regex(/^[A-Za-z0-9\-_]+$/, 'SKU فقط حروف انگلیسی، عدد، - و _')
  .transform((v) => v.toUpperCase());

const compareAtRefine = (v: { price?: number; compareAtPrice?: number | null }) =>
  v.compareAtPrice === undefined ||
  v.compareAtPrice === null ||
  v.price === undefined ||
  v.compareAtPrice > v.price;
const compareAtMessage = {
  message: 'قیمت قبل از تخفیف باید بیشتر از قیمت فروش باشد',
  path: ['compareAtPrice'],
};

export const createVariantSchema = z
  .object({
    colorId: idSchema,
    storageId: idSchema,
    sku: skuSchema,
    price: tomanSchema.refine((v) => v > 0, 'قیمت فروش را وارد کنید'),
    compareAtPrice: tomanSchema.optional().nullable(),
    shippingTime: z.enum(SHIPPING_TIMES),
    isActive: z.boolean().default(true),
    stock: z.coerce.number().int().min(0).max(100_000).default(0),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000).default(2),
  })
  .refine(compareAtRefine, compareAtMessage);
export type CreateVariantInput = z.infer<typeof createVariantSchema>;

export const updateVariantSchema = z
  .object({
    sku: skuSchema,
    price: tomanSchema.refine((v) => v > 0, 'قیمت فروش را وارد کنید'),
    compareAtPrice: tomanSchema.nullable(),
    shippingTime: z.enum(SHIPPING_TIMES),
    isActive: z.boolean(),
  })
  .partial()
  .refine(compareAtRefine, compareAtMessage);
export type UpdateVariantInput = z.infer<typeof updateVariantSchema>;

export const adminVariantListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  productId: idSchema.optional(),
  stock: z.enum(['all', 'in', 'low', 'out']).optional().default('all'),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 200, 50),
});

// ─── Colors & storages ───────────────────────────────────────────────────────

export const colorSchema = z.object({
  code: slugSchema,
  name: text(2, 40, 'نام رنگ'),
  nameEn: text(2, 40, 'نام انگلیسی رنگ'),
  hex: z
    .string()
    .trim()
    .regex(/^#[0-9a-fA-F]{6}$/, 'کد رنگ باید مثل #1A2B3C باشد'),
  finish: optionalText(300),
  aliases: z.array(z.string().trim().min(1).max(30)).max(20).default([]),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type ColorInput = z.infer<typeof colorSchema>;

export const storageSchema = z.object({
  capacityGb: z.coerce.number().int().min(8).max(16_384),
  label: text(2, 20, 'برچسب'),
  labelFa: text(2, 30, 'برچسب فارسی'),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});
export type StorageInput = z.infer<typeof storageSchema>;

export const imageMetaSchema = z.object({
  colorId: idSchema.optional().nullable(),
  alt: optionalText(160),
  sortOrder: z.coerce.number().int().min(0).max(1000).optional(),
  /** DEVICE: the phone on a transparent/plain background · DETAIL: a photo that fills the frame */
  kind: z.enum(PRODUCT_IMAGE_KINDS).optional(),
});

// ─── Inventory ───────────────────────────────────────────────────────────────

export const inventoryAdjustSchema = z
  .object({
    mode: z.enum(['set', 'delta']),
    value: z.coerce.number().int().min(-100_000).max(100_000),
    reason: text(2, 200, 'دلیل تغییر'),
    lowStockThreshold: z.coerce.number().int().min(0).max(1000).optional(),
  })
  .refine((v) => v.mode === 'delta' || v.value >= 0, {
    message: 'موجودی نمی‌تواند منفی باشد',
    path: ['value'],
  })
  .refine((v) => v.mode === 'set' || v.value !== 0, { message: 'مقدار تغییر صفر است', path: ['value'] });
export type InventoryAdjustInput = z.infer<typeof inventoryAdjustSchema>;

// ─── Orders ──────────────────────────────────────────────────────────────────

/** A Tehran calendar day from a query string: ISO «2026-09-26» or Jalali «1405/07/04»; anything else is ignored. */
const dayFromQuery = z.preprocess((v) => {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  const value = v.trim();
  return isIsoDate(value) ? value : (parseJalaliInput(value) ?? undefined);
}, z.string().optional());

export const adminOrderListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvFromQuery.pipe(z.array(z.enum(ORDER_STATUSES))),
  paymentMethod: csvFromQuery.pipe(z.array(z.enum(ORDER_PAYMENT_METHODS))),
  source: csvFromQuery.pipe(z.array(z.enum(ORDER_SOURCES))),
  /** first and last Tehran day, both included */
  from: dayFromQuery,
  to: dayFromQuery,
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});
export type AdminOrderListQuery = z.infer<typeof adminOrderListQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: optionalText(300),
  trackingCode: optionalText(60),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

// ─── Users ───────────────────────────────────────────────────────────────────

export const adminUserListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});

export const adminUpdateUserSchema = z.object({
  isActive: z.boolean().optional(),
  firstName: optionalText(50),
  lastName: optionalText(50),
});

// ─── Payments ────────────────────────────────────────────────────────────────

export const adminPaymentListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvFromQuery.pipe(z.array(z.enum(PAYMENT_STATUSES))),
  method: csvFromQuery.pipe(z.array(z.enum(ORDER_PAYMENT_METHODS))),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});
export type AdminPaymentListQuery = z.infer<typeof adminPaymentListQuerySchema>;

export const adminVariantListQuery = adminVariantListQuerySchema;
export type AdminVariantListQuery = z.infer<typeof adminVariantListQuerySchema>;
export type AdminProductListQuery = z.infer<typeof adminProductListQuerySchema>;
export type AdminUserListQuery = z.infer<typeof adminUserListQuerySchema>;
export type AuditListQuery = z.infer<typeof auditListQuerySchema>;

// ─── Discounts & coupons ─────────────────────────────────────────────────────

const optionalDate = z
  .union([z.string().datetime({ offset: true }), z.string().date(), z.literal(''), z.null()])
  .optional()
  .transform((v) => (v ? new Date(v).toISOString() : null));

export const discountSchema = z
  .object({
    name: text(2, 80, 'نام تخفیف'),
    type: z.enum(DISCOUNT_TYPES),
    value: z.coerce.number().int().min(1, 'مقدار تخفیف را وارد کنید'),
    maxDiscount: tomanSchema.optional().nullable(),
    minOrderAmount: tomanSchema.optional().nullable(),
    startsAt: optionalDate,
    endsAt: optionalDate,
    isActive: z.boolean().default(true),
  })
  .refine((v) => v.type !== 'PERCENT' || v.value <= 100, {
    message: 'درصد تخفیف حداکثر ۱۰۰ است',
    path: ['value'],
  })
  .refine((v) => !v.startsAt || !v.endsAt || new Date(v.startsAt) < new Date(v.endsAt), {
    message: 'تاریخ پایان باید بعد از شروع باشد',
    path: ['endsAt'],
  });
export type DiscountInput = z.infer<typeof discountSchema>;

export const couponSchema = z.object({
  code: couponCodeSchema.pipe(z.string().regex(/^[A-Z0-9_-]+$/, 'کد فقط حروف انگلیسی و عدد')),
  discountId: idSchema,
  usageLimit: z.coerce.number().int().min(1).max(1_000_000).optional().nullable(),
  perUserLimit: z.coerce.number().int().min(1).max(100).default(1),
  isActive: z.boolean().default(true),
});
export type CouponInput = z.infer<typeof couponSchema>;

// ─── Shipping ────────────────────────────────────────────────────────────────

export const SHIPPING_CALCULATORS = ['flat', 'city_courier'] as const;

export const shippingMethodSchema = z.object({
  code: slugSchema,
  name: text(2, 60, 'نام روش ارسال'),
  description: optionalText(200),
  calculator: z.enum(SHIPPING_CALCULATORS),
  baseCost: tomanSchema,
  freeThreshold: tomanSchema.optional().nullable(),
  etaLabel: text(2, 60, 'زمان تحویل'),
  allowedProvinces: z.array(z.string().trim().min(2).max(40)).max(40).default([]),
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type ShippingMethodInput = z.infer<typeof shippingMethodSchema>;

// ─── Admin users ─────────────────────────────────────────────────────────────

export const adminUserSchema = z.object({
  phone: phoneSchema,
  name: text(2, 60, 'نام'),
  role: z.enum(ADMIN_ROLES),
  isActive: z.boolean().default(true),
});
export type AdminUserInput = z.infer<typeof adminUserSchema>;

export const auditListQuerySchema = z.object({
  entityType: z.string().trim().max(40).optional(),
  entityId: z.string().trim().max(64).optional(),
  adminUserId: z.string().trim().max(64).optional(),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 30),
});
