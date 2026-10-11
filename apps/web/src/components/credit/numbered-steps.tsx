import { formatNumberFa } from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion/reveal';

export interface Step {
  title: string;
  text: string;
}

/** A how-to as numbered cards; each title is a heading, so the steps read as an outline. */
export function NumberedSteps({ steps, className }: { steps: Step[]; className?: string }) {
  return (
    <ol className={cn('grid gap-3 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {steps.map((step, i) => (
        <Reveal
          key={step.title}
          as="li"
          delay={i * 80}
          className="group relative flex h-full gap-3.5 rounded-2xl border border-line bg-canvas p-4 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
        >
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-brand-soft text-[13px] font-bold text-brand-ink tabular transition-transform duration-300 group-hover:scale-110"
          >
            {formatNumberFa(i + 1)}
          </span>
          <div className="min-w-0">
            <h3 className="text-[14px] font-semibold leading-6 text-ink">{step.title}</h3>
            <p className="mt-1 text-[12px] leading-6 text-muted">{step.text}</p>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
