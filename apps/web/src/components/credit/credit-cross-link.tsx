import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { CreditMethod } from '@iphoneha/shared';
import { CREDIT_COLORS, CREDIT_PAGES } from '@/lib/credit';
import { readableShade } from '@/lib/color';
import { PlanIcon } from './plan-icon';

/** «دسته‌چک نداری؟ خرید آیفون با سفته» — a nudge to the other plan's page. */
export function CreditCrossLink({
  method,
  question,
  text,
}: {
  method: CreditMethod;
  question: string;
  text: string;
}) {
  const color = CREDIT_COLORS[method];
  const page = CREDIT_PAGES[method];
  return (
    <Link
      href={page.path}
      style={{ '--plan': color, '--plan-ink': readableShade(color) } as CSSProperties}
      className="group flex items-center gap-4 rounded-panel border border-line bg-[color-mix(in_srgb,var(--plan)_5%,white)] p-5 transition-[border-color,transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--plan)_40%,white)] hover:shadow-[0_22px_40px_-28px_var(--plan)]"
    >
      <PlanIcon method={method} color={color} size={48} />
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] text-muted">{question}</span>
        <span className="mt-0.5 block text-[15px] font-semibold text-[var(--plan-ink)]">{page.title}</span>
        <span className="mt-1 block text-[12px] leading-6 text-muted">{text}</span>
      </span>
      <ArrowLeft
        className="size-5 shrink-0 text-[var(--plan-ink)] transition-transform duration-300 group-hover:-translate-x-1"
        aria-hidden
      />
    </Link>
  );
}
