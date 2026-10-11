import type { SpecDto } from '@iphoneha/shared';

export function SpecsTable({ specs }: { specs: SpecDto[] }) {
  if (specs.length === 0) return null;
  return (
    <div className="overflow-hidden rounded-panel border border-line">
      <h2 className="border-b border-line px-5 py-4 text-[15px] font-semibold text-ink">مشخصات فنی</h2>
      <dl className="divide-y divide-line">
        {specs.map((spec) => (
          <div key={spec.key} className="flex items-start gap-4 px-5 py-3.5">
            <dt className="w-32 shrink-0 text-[12px] text-muted">{spec.key}</dt>
            <dd className="text-[13px] leading-6 text-ink-muted">{spec.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
