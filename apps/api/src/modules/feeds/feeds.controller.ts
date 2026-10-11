import { All, Body, Controller, Header, HttpCode, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { SkipCsrf } from '../../common/decorators';
import { Errors } from '../../common/errors';
import { FEED_PAGE_SIZE, FeedsService, type FeedItem } from './feeds.service';

const list = (max: number) =>
  z
    .union([z.array(z.string().max(2000)), z.string().max(2000)])
    .transform((value) => (Array.isArray(value) ? value : [value]))
    .pipe(z.array(z.string()).max(max))
    .optional();

/** Torob sends JSON in a POST; the same fields also work as a query string, for a quick look in a browser. */
const torobRequestSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(['date_added_desc', 'date_updated_desc']).default('date_added_desc'),
  page_urls: list(FEED_PAGE_SIZE),
  page_uniques: list(FEED_PAGE_SIZE),
});

const emallsRequestSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(FEED_PAGE_SIZE).default(FEED_PAGE_SIZE),
});

function parse<T extends z.ZodType>(schema: T, body: unknown, query: unknown): z.infer<T> {
  // a JSON body wins; an empty body (GET, or a POST without one) falls back to the query string
  const input = body && typeof body === 'object' && Object.keys(body).length > 0 ? body : query;
  const parsed = schema.safeParse(input ?? {});
  if (!parsed.success) {
    throw Errors.validation({
      fields: Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.') || '_', i.message])),
    });
  }
  return parsed.data;
}

/**
 * Product feeds for the price-comparison sites. The data is exactly what the
 * product pages already show, so the feeds are public; the address is what
 * the owner hands to Torob's and Emalls' support.
 */
@ApiTags('feeds')
@Controller('feeds')
export class FeedsController {
  constructor(private readonly feeds: FeedsService) {}

  @All('torob')
  @SkipCsrf()
  @HttpCode(200)
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: 'Torob API v3: every colour × capacity on sale, 100 per page, or a lookup' })
  async torob(@Body() body: unknown, @Query() query: unknown) {
    const request = parse(torobRequestSchema, body, query);
    const lookup = Boolean(request.page_urls?.length || request.page_uniques?.length);
    const all = lookup
      ? await this.feeds.lookup(request.page_urls ?? [], request.page_uniques ?? [])
      : await this.feeds.items(request.sort);
    const maxPages = Math.max(1, Math.ceil(all.length / FEED_PAGE_SIZE));
    const page = lookup ? 1 : request.page;

    return {
      api_version: 'torob_api_v3',
      current_page: page,
      total: all.length,
      max_pages: maxPages,
      products: all.slice((page - 1) * FEED_PAGE_SIZE, page * FEED_PAGE_SIZE),
    };
  }

  @All('emalls')
  @SkipCsrf()
  @HttpCode(200)
  @Header('X-Robots-Tag', 'noindex')
  @ApiOperation({ summary: 'Emalls: every colour × capacity on sale, in the Emalls extractor format' })
  async emalls(@Body() body: unknown, @Query() query: unknown) {
    const request = parse(emallsRequestSchema, body, query);
    const all = await this.feeds.items('date_updated_desc');
    const slice = all.slice((request.page - 1) * request.limit, request.page * request.limit);

    return {
      count: all.length,
      current_page: request.page,
      max_pages: Math.max(1, Math.ceil(all.length / request.limit)),
      // the Emalls extractor sends the spec sheet wrapped in a list
      products: slice.map((item): Omit<FeedItem, 'spec'> & { spec: Record<string, string>[] } => ({
        ...item,
        spec: [item.spec],
      })),
    };
  }
}
