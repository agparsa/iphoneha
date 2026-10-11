import { FileSignature, PackageCheck, Phone, Smartphone } from 'lucide-react';
import { formatNumberFa } from '@iphoneha/shared';
import { cn } from '@/lib/utils';
import { Reveal } from '@/components/motion/reveal';

/** How buying with a cheque or promissory note actually goes, in the store's order. */
function chequeSteps(onProductPage: boolean) {
  return [
    {
      icon: Smartphone,
      title: 'انتخاب مدل',
      text: onProductPage
        ? 'رنگ و حافظه را همین‌جا انتخاب کن.'
        : 'رنگ و حافظه را در صفحهٔ آیفون دلخواهت انتخاب کن.',
    },
    { icon: Phone, title: 'تماس و استعلام', text: 'کارشناس ما شرایط و استعلام چک را بررسی می‌کند.' },
    { icon: FileSignature, title: 'قرارداد رسمی', text: 'پیش‌پرداخت و جدول اقساط در قرارداد نوشته می‌شود.' },
    { icon: PackageCheck, title: 'تحویل آکبند', text: 'گوشی پلمب و اصل به دستت می‌رسد.' },
  ];
}

/** The four steps as numbered cards that cascade in when scrolled to. */
export function ChequeSteps({
  className,
  onProductPage = false,
}: {
  className?: string;
  /** the product page already shows the colour and capacity picker */
  onProductPage?: boolean;
}) {
  return (
    <ol className={cn('grid gap-3 sm:grid-cols-2', className)}>
      {chequeSteps(onProductPage).map((step, i) => (
        <Reveal
          key={step.title}
          as="li"
          delay={i * 90}
          className="group flex h-full items-start gap-3 rounded-2xl border border-line bg-canvas p-3.5 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
        >
          <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
            <step.icon className="size-5" aria-hidden />
            <span className="absolute -top-1.5 -left-1.5 grid size-5 place-items-center rounded-full bg-brand-strong text-[10px] font-bold text-white tabular">
              {formatNumberFa(i + 1)}
            </span>
          </span>
          <span>
            <span className="block text-[13px] font-semibold text-ink">{step.title}</span>
            <span className="mt-0.5 block text-[11px] leading-5 text-muted">{step.text}</span>
          </span>
        </Reveal>
      ))}
    </ol>
  );
}
