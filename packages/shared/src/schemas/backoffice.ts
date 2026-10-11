/**
 * Inputs of the back office: phone and in-store orders, the store's own
 * instalment ledger (contracts, cheques, promissory notes, payments), the
 * IMEI registry, bulk pricing, customer notes and reports.
 */
import { z } from 'zod';
import {
  CHEQUE_STATUSES,
  CONTRACT_STATUSES,
  CREDIT_METHODS,
  DEVICE_UNIT_STATUSES,
  ORDER_STATUSES,
} from '../enums';
import { PRICE_ROUNDINGS } from '../backoffice-types';
import { digitsOnly, isValidImei, isValidNationalId, isValidSayadId } from '../identifiers';
import { daysBetweenIso, isIsoDate, parseJalaliInput } from '../jalali';
import { boolFromQuery, csvFromQuery, idSchema, intFromQuery, phoneSchema, tomanSchema } from './common';
import { addressSchema } from './user';

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `حداکثر ${max} حرف`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const requiredText = (min: number, max: number, label: string) =>
  z
    .string({ error: `${label} را وارد کنید` })
    .trim()
    .min(min, `${label} را وارد کنید`)
    .max(max, `${label} خیلی بلند است`);

/** Empty or missing → null, otherwise the given schema. */
const optionalOf = <T extends z.ZodType>(schema: T) =>
  z
    .preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), schema.optional())
    .transform((v) => (v === undefined ? null : v));

const positiveToman = (label: string) => tomanSchema.refine((v) => v > 0, `${label} باید بیشتر از صفر باشد`);

/** A calendar day: ISO «2026-09-26», or Jalali as the staff type it, «1405/07/04». */
export const calendarDaySchema = z
  .string({ error: 'تاریخ را وارد کنید' })
  .trim()
  .transform((value, ctx) => {
    if (isIsoDate(value)) return value;
    const iso = parseJalaliInput(value);
    if (!iso) {
      ctx.addIssue({ code: 'custom', message: 'تاریخ معتبر نیست؛ مثل ۱۴۰۵/۰۷/۱۰ بنویس' });
      return z.NEVER;
    }
    return iso;
  });

/** 15 digits with a valid check digit; spaces, dashes and Persian digits are fine. */
export const imeiSchema = z.string({ error: 'IMEI را وارد کنید' }).transform((value, ctx) => {
  const digits = digitsOnly(value);
  if (!isValidImei(digits)) {
    ctx.addIssue({ code: 'custom', message: `IMEI «${value.trim()}» معتبر نیست (۱۵ رقم و رقم کنترل درست)` });
    return z.NEVER;
  }
  return digits;
});

export const nationalIdSchema = z.string().transform((value, ctx) => {
  const digits = digitsOnly(value);
  if (!isValidNationalId(digits)) {
    ctx.addIssue({ code: 'custom', message: 'کد ملی معتبر نیست' });
    return z.NEVER;
  }
  return digits;
});

export const sayadIdSchema = z.string({ error: 'شناسهٔ صیادی را وارد کنید' }).transform((value, ctx) => {
  const digits = digitsOnly(value);
  if (!isValidSayadId(digits)) {
    ctx.addIssue({ code: 'custom', message: 'شناسهٔ صیادی ۱۶ رقم است' });
    return z.NEVER;
  }
  return digits;
});

// ─── Devices (IMEI) ──────────────────────────────────────────────────────────

export const deviceReceiveSchema = z
  .object({
    variantId: idSchema,
    units: z
      .array(
        z.object({
          imei: imeiSchema,
          imei2: optionalOf(imeiSchema),
          serialNumber: optionalText(40),
        }),
      )
      .min(1, 'حداقل یک IMEI وارد کن')
      .max(200, 'در هر بار حداکثر ۲۰۰ گوشی'),
    costPrice: optionalOf(tomanSchema),
    supplier: optionalText(80),
    note: optionalText(300),
  })
  .superRefine((input, ctx) => {
    const seen = new Set<string>();
    for (const [index, unit] of input.units.entries()) {
      for (const imei of [unit.imei, unit.imei2].filter(Boolean) as string[]) {
        if (seen.has(imei)) {
          ctx.addIssue({
            code: 'custom',
            path: ['units', index, 'imei'],
            message: `IMEI ${imei} دو بار آمده است`,
          });
        }
        seen.add(imei);
      }
    }
  });
export type DeviceReceiveInput = z.infer<typeof deviceReceiveSchema>;

export const deviceListQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  variantId: idSchema.optional(),
  status: csvFromQuery.pipe(z.array(z.enum(DEVICE_UNIT_STATUSES))),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 200, 50),
});
export type DeviceListQuery = z.infer<typeof deviceListQuerySchema>;

/** A unit that is not on an order: its condition, cost or note. Selling happens on an order. */
export const deviceUpdateSchema = z.object({
  status: z.enum(['IN_STOCK', 'RETURNED', 'DEFECTIVE']).optional(),
  costPrice: optionalOf(tomanSchema).optional(),
  supplier: optionalText(80).optional(),
  note: optionalText(300).optional(),
});
export type DeviceUpdateInput = z.infer<typeof deviceUpdateSchema>;

/** The phones handed over for each line of an order (replaces what was set before). */
export const orderDevicesSchema = z.object({
  assignments: z
    .array(z.object({ orderItemId: idSchema, deviceIds: z.array(idSchema).max(10) }))
    .min(1)
    .max(20),
});
export type OrderDevicesInput = z.infer<typeof orderDevicesSchema>;

// ─── The instalment ledger ───────────────────────────────────────────────────

export const chequeInputSchema = z.object({
  /** which instalment it pays (1…n); null = a guarantee cheque for the whole contract */
  installmentIndex: z.coerce.number().int().min(1).max(60).optional().nullable(),
  sayadId: sayadIdSchema,
  serial: optionalText(30),
  bankName: requiredText(2, 60, 'نام بانک'),
  branch: optionalText(60),
  drawerName: requiredText(3, 80, 'نام صاحب حساب'),
  amount: positiveToman('مبلغ چک'),
  dueDate: calendarDaySchema,
  sayadConfirmed: z.boolean().default(false),
  note: optionalText(300),
});
export type ChequeInput = z.infer<typeof chequeInputSchema>;

export const safteInputSchema = z.object({
  serial: requiredText(3, 40, 'شمارهٔ سفته'),
  amount: positiveToman('مبلغ سفته'),
  electronic: z.boolean().default(false),
  dueDate: optionalOf(calendarDaySchema),
  note: optionalText(300),
});
export type SafteInput = z.infer<typeof safteInputSchema>;

const scheduleSchema = z
  .array(z.object({ dueDate: calendarDaySchema, amount: positiveToman('مبلغ قسط') }))
  .min(1, 'حداقل یک قسط لازم است')
  .max(60, 'حداکثر ۶۰ قسط');

/** Only the channels a person pays with at the counter or by transfer. */
export const counterChannelSchema = z.enum(['CASH', 'POS', 'TRANSFER']);

/** What every contract states besides the customer and the price. */
const contractTermsShape = {
  nationalId: optionalOf(nationalIdSchema),
  customerAddress: optionalText(400),
  guarantor: z
    .object({
      name: requiredText(3, 80, 'نام ضامن'),
      phone: phoneSchema,
      nationalId: optionalOf(nationalIdSchema),
    })
    .optional()
    .nullable()
    .transform((v) => v ?? null),
  downPayment: tomanSchema,
  downPaymentChannel: counterChannelSchema.default('POS'),
  downPaymentReference: optionalText(80),
  monthlyFeePercent: optionalOf(z.coerce.number().min(0).max(15)),
  contractDate: calendarDaySchema,
  installments: scheduleSchema,
  cheques: z.array(chequeInputSchema).max(60).default([]),
  saftes: z.array(safteInputSchema).max(20).default([]),
  note: optionalText(1000),
};

/** Checks both a contract on its own and one written with an order. */
function refineContract(
  input: {
    installments: { dueDate: string; amount: number }[];
    cheques: { installmentIndex?: number | null; sayadId: string }[];
    downPayment: number;
    contractDate: string;
  },
  cashPrice: number | null,
  ctx: z.RefinementCtx,
): void {
  if (cashPrice !== null && input.downPayment > cashPrice) {
    ctx.addIssue({ code: 'custom', path: ['downPayment'], message: 'پیش‌پرداخت از قیمت کالا بیشتر است' });
  }
  input.installments.forEach((row, index) => {
    const previous = input.installments[index - 1];
    if (previous && row.dueDate < previous.dueDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['installments', index, 'dueDate'],
        message: 'سررسیدها باید به ترتیب باشند',
      });
    }
    if (daysBetweenIso(input.contractDate, row.dueDate) < 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['installments', index, 'dueDate'],
        message: 'سررسید قسط پیش از تاریخ قرارداد است',
      });
    }
  });
  const sayad = new Set<string>();
  const paid = new Set<number>();
  input.cheques.forEach((cheque, index) => {
    if (sayad.has(cheque.sayadId)) {
      ctx.addIssue({
        code: 'custom',
        path: ['cheques', index, 'sayadId'],
        message: 'این شناسهٔ صیادی تکراری است',
      });
    }
    sayad.add(cheque.sayadId);
    const target = cheque.installmentIndex;
    if (target) {
      if (target > input.installments.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['cheques', index, 'installmentIndex'],
          message: 'چنین قسطی نیست',
        });
      } else if (paid.has(target)) {
        ctx.addIssue({
          code: 'custom',
          path: ['cheques', index, 'installmentIndex'],
          message: `برای قسط ${target} دو چک آمده است`,
        });
      }
      paid.add(target);
    }
  });
}

/** A contract written with a phone or in-store order: the price is the order's total. */
export const orderContractSchema = z
  .object({ ...contractTermsShape, itemDescription: optionalText(300) })
  .superRefine((input, ctx) => refineContract(input, null, ctx));
export type OrderContractInput = z.infer<typeof orderContractSchema>;

/** A contract on its own: an older sale, or one recorded before the goods go out. */
export const contractCreateSchema = z
  .object({
    ...contractTermsShape,
    method: z.enum(CREDIT_METHODS),
    creditRequestId: optionalOf(idSchema),
    customer: z.object({ name: requiredText(3, 80, 'نام مشتری'), phone: phoneSchema }),
    itemDescription: requiredText(3, 300, 'شرح کالا'),
    cashPrice: positiveToman('قیمت کالا'),
    /** SMS the customer the booklet: how many instalments, how much, the first due date */
    notifyCustomer: z.boolean().default(true),
  })
  .superRefine((input, ctx) => refineContract(input, input.cashPrice, ctx));
export type ContractCreateInput = z.infer<typeof contractCreateSchema>;

export const contractUpdateSchema = z.object({
  nationalId: optionalOf(nationalIdSchema).optional(),
  customerAddress: optionalText(400).optional(),
  guarantorName: optionalText(80).optional(),
  guarantorPhone: optionalOf(phoneSchema).optional(),
  guarantorNationalId: optionalOf(nationalIdSchema).optional(),
  itemDescription: requiredText(3, 300, 'شرح کالا').optional(),
  note: optionalText(1000).optional(),
});
export type ContractUpdateInput = z.infer<typeof contractUpdateSchema>;

export const contractStatusSchema = z.object({
  status: z.enum(['ACTIVE', 'DEFAULTED', 'CANCELLED']),
  reason: optionalText(300),
});
export type ContractStatusInput = z.infer<typeof contractStatusSchema>;

export const contractListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvFromQuery.pipe(z.array(z.enum(CONTRACT_STATUSES))),
  method: csvFromQuery.pipe(z.array(z.enum(CREDIT_METHODS))),
  overdue: boolFromQuery,
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 20),
});
export type ContractListQuery = z.infer<typeof contractListQuerySchema>;

/** Money received on a contract. Without an instalment it pays the oldest open ones first. */
export const contractPaymentSchema = z.object({
  installmentId: optionalOf(idSchema),
  amount: positiveToman('مبلغ'),
  channel: z.enum(['CASH', 'POS', 'TRANSFER', 'ONLINE']),
  reference: optionalText(80),
  paidAt: optionalOf(calendarDaySchema),
  note: optionalText(300),
  /** SMS the customer «پرداخت قسط ثبت شد» with what is still owed */
  notifyCustomer: z.boolean().default(true),
});
export type ContractPaymentInput = z.infer<typeof contractPaymentSchema>;

export const installmentUpdateSchema = z.object({
  dueDate: calendarDaySchema.optional(),
  amount: positiveToman('مبلغ قسط').optional(),
  note: optionalText(300).optional(),
  /** forgive what is left of it */
  waive: z.boolean().optional(),
});
export type InstallmentUpdateInput = z.infer<typeof installmentUpdateSchema>;

export const chequeCreateSchema = chequeInputSchema.omit({ installmentIndex: true }).extend({
  installmentId: optionalOf(idSchema),
});
export type ChequeCreateInput = z.infer<typeof chequeCreateSchema>;

export const CHEQUE_ACTIONS = [
  'CONFIRM_SAYAD',
  'DEPOSIT',
  'CLEAR',
  'BOUNCE',
  'RETURN',
  'BACK_IN_HAND',
] as const;
export type ChequeAction = (typeof CHEQUE_ACTIONS)[number];

export const chequeActionSchema = z.object({
  action: z.enum(CHEQUE_ACTIONS),
  /** the day it happened (default: today) */
  date: optionalOf(calendarDaySchema),
  note: optionalText(300),
});
export type ChequeActionInput = z.infer<typeof chequeActionSchema>;

export const chequeListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: csvFromQuery.pipe(z.array(z.enum(CHEQUE_STATUSES))),
  /** due within this many days (overdue ones included) */
  dueWithin: intFromQuery(0, 365, 0),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 100, 30),
});
export type ChequeListQuery = z.infer<typeof chequeListQuerySchema>;

export const safteCreateSchema = safteInputSchema;
export const safteActionSchema = z.object({
  action: z.enum(['HOLD', 'RETURN', 'CLAIM']),
  note: optionalText(300),
});
export type SafteActionInput = z.infer<typeof safteActionSchema>;

export const dueListQuerySchema = z.object({
  /** open instalments due within this many days; overdue ones always come first */
  days: intFromQuery(0, 366, 14),
  method: csvFromQuery.pipe(z.array(z.enum(CREDIT_METHODS))),
  page: intFromQuery(1, 10_000, 1),
  pageSize: intFromQuery(1, 200, 50),
});
export type DueListQuery = z.infer<typeof dueListQuerySchema>;

// ─── Phone and in-store orders ───────────────────────────────────────────────

/** The shipping snapshot of an order collected at the store (no courier, no address). */
export const PICKUP_METHOD = {
  code: 'pickup',
  name: 'تحویل حضوری در فروشگاه',
  etaLabel: 'همان روز',
} as const;

export const manualOrderSchema = z
  .object({
    source: z.enum(['PHONE', 'IN_STORE']),
    customer: z.object({
      phone: phoneSchema,
      firstName: optionalText(40),
      lastName: optionalText(60),
    }),
    items: z
      .array(
        z.object({
          variantId: idSchema,
          quantity: z.coerce.number().int().min(1, 'حداقل ۱').max(10, 'حداکثر ۱۰'),
          /** the phones handed over now (in-store sale); can be set later on the order */
          deviceIds: z.array(idSchema).max(10).default([]),
        }),
      )
      .min(1, 'حداقل یک کالا انتخاب کن')
      .max(10),
    /** a discount on the whole order, in Toman */
    discount: tomanSchema.default(0),
    delivery: z.discriminatedUnion('type', [
      z.object({ type: z.literal('PICKUP') }),
      z.object({
        type: z.literal('SHIP'),
        shippingMethodId: idSchema,
        address: addressSchema.omit({ title: true, isDefault: true }),
        /** null = the method's own price for this order */
        shippingCost: optionalOf(tomanSchema),
      }),
    ]),
    payment: z.discriminatedUnion('method', [
      z.object({
        method: z.literal('IN_STORE'),
        channel: counterChannelSchema,
        reference: optionalText(80),
      }),
      z.object({ method: z.literal('CHEQUE'), contract: orderContractSchema }),
      z.object({ method: z.literal('SAFTE'), contract: orderContractSchema }),
    ]),
    adminNote: optionalText(1000),
    /** the customer walked out with the phone: the order is recorded as delivered */
    handedOver: z.boolean().default(false),
    /** send the customer the «order paid» SMS */
    notifyCustomer: z.boolean().default(false),
  })
  .superRefine((input, ctx) => {
    if (input.handedOver && input.delivery.type !== 'PICKUP') {
      ctx.addIssue({
        code: 'custom',
        path: ['handedOver'],
        message: 'فقط سفارش تحویل حضوری همین حالا تحویل می‌شود',
      });
    }
    const seen = new Set<string>();
    input.items.forEach((item, index) => {
      if (seen.has(item.variantId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'variantId'],
          message: 'این کالا دو بار آمده؛ تعدادش را زیاد کن',
        });
      }
      seen.add(item.variantId);
      if (item.deviceIds.length > item.quantity) {
        ctx.addIssue({
          code: 'custom',
          path: ['items', index, 'deviceIds'],
          message: 'تعداد IMEIها از تعداد کالا بیشتر است',
        });
      }
    });
  });
export type ManualOrderInput = z.infer<typeof manualOrderSchema>;

export const orderNoteSchema = z.object({ adminNote: optionalText(1000) });
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;

export const bulkOrderStatusSchema = z.object({
  orderIds: z.array(idSchema).min(1, 'سفارشی انتخاب نشده').max(100),
  status: z.enum(ORDER_STATUSES),
  note: optionalText(300),
});
export type BulkOrderStatusInput = z.infer<typeof bulkOrderStatusSchema>;

// ─── Pricing ─────────────────────────────────────────────────────────────────

export const bulkPriceSchema = z.object({
  variantIds: z.array(idSchema).min(1, 'هیچ ردیفی انتخاب نشده').max(1000),
  /** the sale price, or the «before discount» price */
  target: z.enum(['PRICE', 'COMPARE_AT']).default('PRICE'),
  /** PERCENT: +5 = 5% more · AMOUNT: toman to add (negative lowers) · SET: this exact price */
  mode: z.enum(['PERCENT', 'AMOUNT', 'SET']),
  value: z.coerce.number({ error: 'مقدار را وارد کن' }).finite().min(-10_000_000_000).max(10_000_000_000),
  rounding: z.coerce
    .number()
    .int()
    .refine((v) => (PRICE_ROUNDINGS as readonly number[]).includes(v), 'گرد کردن نامعتبر')
    .default(100_000),
  /** preview only: nothing is saved */
  dryRun: z.boolean().default(true),
});
export type BulkPriceInput = z.infer<typeof bulkPriceSchema>;

export const pricingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  productId: idSchema.optional(),
});
export type PricingQuery = z.infer<typeof pricingQuerySchema>;

// ─── Customers ───────────────────────────────────────────────────────────────

export const customerNoteSchema = z.object({ body: requiredText(2, 1000, 'یادداشت') });
export type CustomerNoteInput = z.infer<typeof customerNoteSchema>;

// ─── Reports and exports ─────────────────────────────────────────────────────

export const reportQuerySchema = z
  .object({ from: calendarDaySchema, to: calendarDaySchema })
  .superRefine((range, ctx) => {
    const days = daysBetweenIso(range.from, range.to);
    if (days < 0) ctx.addIssue({ code: 'custom', path: ['to'], message: 'پایان بازه پیش از شروع آن است' });
    if (days > 731) ctx.addIssue({ code: 'custom', path: ['to'], message: 'بازه حداکثر دو سال' });
  });
export type ReportQuery = z.infer<typeof reportQuerySchema>;

/** Optional range for exports: both ends or neither. */
export const exportQuerySchema = z.object({
  from: optionalOf(calendarDaySchema),
  to: optionalOf(calendarDaySchema),
  status: csvFromQuery,
});
export type ExportQuery = z.infer<typeof exportQuerySchema>;
