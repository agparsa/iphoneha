import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { estimateCreditPlan, formatNumberFa, formatToman } from '@iphoneha/shared';
import { readyCreditPlan, type CalculatorPlan } from '@/lib/credit';
import { readableShade } from '@/lib/color';
import { cn } from '@/lib/utils';
import { ProductImage } from '@/components/store/product-image';
import { SelectionLink } from './selection-link';

export interface PriceTableModel {
  slug: string;
  name: string;
  /** the cheapest capacity and colour on sale */
  price: number;
  image: string | null;
}

/**
 * «قیمت آیفون قسطی»: every model with its cash price and, for each plan, the
 * down payment and the monthly instalment over the plan's longest term. One
 * table for every screen size: on a phone each row becomes a card (the roles
 * keep it a table for screen readers once `display` changes).
 */
export function ModelPriceTable({
  models,
  plans,
  caption,
}: {
  models: PriceTableModel[];
  /** plans with all their figures; none shows cash prices with a request link */
  plans: CalculatorPlan[];
  caption: string;
}) {
  if (models.length === 0) return null;
  const cell = 'px-4 py-3 align-middle max-md:p-0';
  const label =
    'max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:text-muted max-md:before:content-[attr(data-label)]';

  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <table role="table" className="w-full border-collapse text-start text-[13px]">
        <caption className="sr-only">{caption}</caption>
        <thead role="rowgroup" className="bg-surface-2 text-[12px] text-muted max-md:sr-only">
          <tr role="row">
            <th role="columnheader" scope="col" className="px-4 py-3 text-start font-medium">
              مدل
            </th>
            <th role="columnheader" scope="col" className="px-4 py-3 text-start font-medium">
              قیمت نقد (از)
            </th>
            {plans.map((plan) => (
              <th key={plan.id} role="columnheader" scope="col" className="px-4 py-3 text-start font-medium">
                {plan.name}
                <span className="block text-[11px] font-normal text-muted-faint">
                  پیش‌پرداخت و قسط {formatNumberFa(plan.maxMonths)} ماهه
                </span>
              </th>
            ))}
            <th role="columnheader" scope="col" className="px-4 py-3">
              <span className="sr-only">درخواست</span>
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup">
          {models.map((model) => (
            <tr
              key={model.slug}
              role="row"
              className="border-t border-line transition-colors first:border-t-0 hover:bg-surface-2/60 max-md:grid max-md:grid-cols-2 max-md:gap-x-4 max-md:gap-y-3 max-md:p-4"
            >
              <th
                role="rowheader"
                scope="row"
                className={cn(cell, 'text-start font-medium max-md:col-span-2')}
              >
                <Link href={`/iphone/${model.slug}`} className="group flex items-center gap-3 text-ink">
                  <span className="relative size-12 shrink-0 overflow-hidden rounded-xl bg-surface">
                    <ProductImage src={model.image} alt="" sizes="48px" className="p-1" />
                  </span>
                  <span className="group-hover:underline group-hover:underline-offset-4">{model.name}</span>
                </Link>
              </th>
              <td
                role="cell"
                data-label="قیمت نقد (از)"
                className={cn(cell, label, 'tabular text-ink-muted')}
              >
                {formatToman(model.price)}
              </td>
              {plans.map((plan) => {
                const estimate = estimateCreditPlan(model.price, readyCreditPlan(plan));
                return (
                  <td
                    key={plan.id}
                    role="cell"
                    data-label={`${plan.name}، ${formatNumberFa(estimate.months)} قسط`}
                    style={{ '--plan-ink': readableShade(plan.color) } as CSSProperties}
                    className={cn(cell, label, 'tabular')}
                  >
                    <span className="block font-semibold text-[var(--plan-ink)]">
                      {formatToman(estimate.monthly)}
                      <span className="text-[11px] font-normal text-muted"> در ماه</span>
                    </span>
                    <span className="block text-[11px] text-muted">
                      پیش‌پرداخت {formatToman(estimate.downPayment)}
                    </span>
                  </td>
                );
              })}
              <td role="cell" className={cn(cell, 'text-end max-md:col-span-2 max-md:text-start')}>
                <SelectionLink
                  target="request"
                  patch={{ modelSlug: model.slug }}
                  aria-label={`درخواست خرید قسطی ${model.name}`}
                  className="inline-flex items-center gap-1.5 rounded-pill border border-line px-3.5 py-2 text-[12px] font-medium text-ink transition-colors hover:border-ink hover:bg-ink hover:text-white"
                >
                  {plans.length > 0 ? 'درخواست خرید قسطی' : 'استعلام شرایط اقساط'}
                  <ArrowLeft className="size-3.5" aria-hidden />
                </SelectionLink>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
