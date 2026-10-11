import { z } from 'zod';
import { PRODUCT_SORTS, SHIPPING_TIMES } from '../enums';
import { boolFromQuery, csvFromQuery, intFromQuery, optionalIntFromQuery } from './common';

export const productListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  /** product slugs, e.g. iphone-17-pro */
  model: csvFromQuery,
  series: csvFromQuery,
  /** capacities in GB */
  storage: csvFromQuery.pipe(z.array(z.string().regex(/^\d+$/)).transform((a) => a.map(Number))),
  /** colour codes */
  color: csvFromQuery,
  shippingTime: csvFromQuery.pipe(z.array(z.enum(SHIPPING_TIMES))),
  minPrice: optionalIntFromQuery(0, 10_000_000_000),
  maxPrice: optionalIntFromQuery(0, 10_000_000_000),
  inStock: boolFromQuery,
  discounted: boolFromQuery,
  featured: boolFromQuery,
  sort: z.enum(PRODUCT_SORTS).optional().default('featured'),
  page: intFromQuery(1, 1000, 1),
  pageSize: intFromQuery(1, 48, 12),
});
export type ProductListQuery = z.infer<typeof productListQuerySchema>;

export const searchSuggestQuerySchema = z.object({
  q: z.string().trim().min(1).max(100),
  limit: intFromQuery(1, 10, 6),
});
