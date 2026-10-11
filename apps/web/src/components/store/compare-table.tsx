import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { formatNumberFa, type CompareTableDto } from '@iphoneha/shared';
import { ProductImage } from './product-image';
import { RatingStars } from './rating-stars';

/**
 * «مقایسه مدل‌ها» — the rows come from the products' own spec sheets, so the
 * table never shows a row the compared models don't actually define.
 * It scrolls horizontally on phones with the spec column pinned.
 */
function Blank({ label }: { label: string }) {
  return (
    <>
      <span aria-hidden className="text-muted-faint">
        —
      </span>
      <span className="sr-only">{label}</span>
    </>
  );
}

export function CompareTable({ data }: { data: CompareTableDto }) {
  if (data.products.length < 2 || data.rows.length === 0) return null;

  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <p className="border-b border-line bg-surface-2 px-4 py-2 text-[11px] text-muted md:hidden">
        برای دیدن بقیهٔ مدل‌ها، جدول را به چپ بکش.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[42rem] border-collapse text-start">
          <caption className="sr-only">مقایسه مشخصات فنی و قیمت مدل‌های آیفون</caption>
          <thead>
            <tr>
              <th scope="col" className="sticky start-0 z-10 w-36 bg-canvas p-4 text-start align-bottom">
                <span className="eyebrow">Compare</span>
                <span className="mt-1 block text-[13px] font-semibold text-ink">مشخصات</span>
              </th>
              {data.products.map((product) => (
                <th key={product.slug} scope="col" className="min-w-44 border-s border-line p-4 align-bottom">
                  <Link href={product.href} className="group block text-center" prefetch={false}>
                    <span className="relative mx-auto block aspect-square w-20 overflow-hidden rounded-2xl bg-surface-2">
                      <ProductImage
                        src={product.image}
                        alt={product.name}
                        sizes="80px"
                        className="p-1.5 transition-transform duration-500 ease-out-quint group-hover:scale-105"
                      />
                    </span>
                    <span className="mt-2.5 block text-[13px] font-semibold text-ink">{product.name}</span>
                    <span className="mt-0.5 block font-display text-[10px] tracking-wide text-muted-faint uppercase">
                      {product.nameEn}
                    </span>
                  </Link>
                  {product.ratingAvg ? (
                    <span className="mt-2 flex justify-center">
                      <RatingStars value={product.ratingAvg} count={product.ratingCount} showCount={false} />
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-line bg-surface-2/60">
              <th
                scope="row"
                className="sticky start-0 z-10 bg-surface-2 p-4 text-start text-[12px] text-muted"
              >
                شروع قیمت
              </th>
              {data.products.map((product) => (
                <td key={product.slug} className="border-s border-line p-4 text-center">
                  {product.price === null ? (
                    <Blank label="نامشخص" />
                  ) : (
                    <>
                      <span className="block text-[14px] font-semibold text-ink tabular">
                        {formatNumberFa(product.price)}
                      </span>
                      {product.monthly ? (
                        <span className="mt-1 block text-[11px] text-muted tabular">
                          ماهانه {formatNumberFa(product.monthly)}
                        </span>
                      ) : null}
                    </>
                  )}
                </td>
              ))}
            </tr>

            {data.rows.map((row) => (
              <tr key={row.key} className="border-t border-line">
                <th
                  scope="row"
                  className="sticky start-0 z-10 bg-canvas p-4 text-start text-[12px] text-muted"
                >
                  {row.key}
                </th>
                {row.values.map((value, index) => (
                  <td
                    key={data.products[index]?.slug ?? index}
                    className="border-s border-line p-4 text-center text-[12px] leading-6 text-ink-muted"
                  >
                    {value ?? <Blank label="ندارد" />}
                  </td>
                ))}
              </tr>
            ))}

            <tr className="border-t border-line">
              <th scope="row" className="sticky start-0 z-10 bg-canvas p-4 text-start text-[12px] text-muted">
                خرید
              </th>
              {data.products.map((product) => (
                <td key={product.slug} className="border-s border-line p-4 text-center">
                  <Link
                    href={product.href}
                    prefetch={false}
                    className="inline-flex items-center gap-1 rounded-pill border border-line px-3 py-1.5 text-[12px] font-medium text-ink transition-colors hover:border-ink"
                  >
                    {product.inStock ? 'مشاهده و خرید' : 'مشاهده مدل'}
                    <ArrowLeft className="size-3.5" aria-hidden />
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
