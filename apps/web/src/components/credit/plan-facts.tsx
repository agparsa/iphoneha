import type { CSSProperties } from 'react';
import type { PlanFact } from '@/lib/credit';
import { readableShade } from '@/lib/color';
import { cn } from '@/lib/utils';

/** The owner's figures for a plan as a row of cards (only the ones he has filled in). */
export function PlanFacts({
  facts,
  color,
  className,
}: {
  facts: PlanFact[];
  color: string;
  className?: string;
}) {
  if (facts.length === 0) return null;
  return (
    <dl
      style={{ '--plan': color, '--plan-ink': readableShade(color) } as CSSProperties}
      className={cn('grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6', className)}
    >
      {facts.map((fact) => (
        <div
          key={fact.label}
          className="rounded-2xl border border-line bg-canvas p-4 transition-colors duration-300 hover:border-[color-mix(in_srgb,var(--plan)_40%,white)]"
        >
          <dt className="text-[11px] text-muted">{fact.label}</dt>
          <dd className="mt-1 text-[14px] font-semibold leading-6 text-[var(--plan-ink)]">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}
