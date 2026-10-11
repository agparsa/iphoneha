import {
  BatteryFull,
  Camera,
  Cpu,
  Droplets,
  Feather,
  Ruler,
  ScanFace,
  ShieldCheck,
  Smartphone,
  ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { SpecDto } from '@iphoneha/shared';
import { Reveal } from '@/components/motion/reveal';

const ICONS: Record<string, LucideIcon> = {
  نمایشگر: Smartphone,
  تراشه: Cpu,
  'دوربین اصلی': Camera,
  زوم: ZoomIn,
  باتری: BatteryFull,
  'دوربین سلفی': ScanFace,
  بدنه: ShieldCheck,
  وزن: Feather,
  ضخامت: Ruler,
  مقاومت: Droplets,
};

/** the four specs a buyer compares first, in this order when present */
const LEAD = ['نمایشگر', 'تراشه', 'دوربین اصلی', 'زوم', 'باتری', 'ضخامت'];

/** «در یک نگاه»: the headline specs as cards that rise into view one after another. */
export function ProductHighlights({ specs, name }: { specs: SpecDto[]; name: string }) {
  const lead = LEAD.map((key) => specs.find((spec) => spec.key === key)).filter((spec): spec is SpecDto =>
    Boolean(spec),
  );
  if (lead.length < 2) return null;

  return (
    <section className="mt-12" aria-labelledby="highlights-title">
      <h2 id="highlights-title" className="text-[17px] font-semibold text-ink">
        {name} در یک نگاه
      </h2>
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {lead.slice(0, 4).map((spec, i) => {
          const Icon = ICONS[spec.key] ?? Smartphone;
          return (
            <Reveal key={spec.key} delay={i * 90} className="h-full">
              <div className="group relative h-full overflow-hidden rounded-panel border border-line bg-canvas p-4 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-brand/35 hover:shadow-card sm:p-5">
                <span
                  aria-hidden
                  className="absolute -top-10 -left-10 size-28 rounded-full bg-brand-soft opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100"
                />
                <span className="relative grid size-11 place-items-center rounded-2xl bg-brand-soft text-brand transition-transform duration-500 group-hover:-rotate-6 group-hover:scale-110">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="relative mt-4 text-[12px] text-muted">{spec.key}</p>
                <p className="relative mt-1 text-[13px] leading-6 font-semibold text-ink">{spec.value}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
