import { BadgeCheck, PackageCheck, ShieldCheck, Truck } from 'lucide-react';

const ITEMS = [
  { icon: BadgeCheck, title: 'اصالت کالا', text: '۱۰۰٪ آیفون اورجینال' },
  { icon: PackageCheck, title: 'آکبند', text: 'کاملاً پلمپ و نو' },
  { icon: Truck, title: 'ارسال سریع', text: 'ارسال به سراسر ایران' },
  { icon: ShieldCheck, title: 'ضمانت خرید', text: 'پرداخت امن و مطمئن' },
];

export function TrustStrip() {
  return (
    <ul className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {ITEMS.map((item) => (
        <li key={item.title} className="flex items-center gap-3 rounded-2xl border border-line px-4 py-3.5">
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface text-ink">
            <item.icon className="size-[18px]" aria-hidden />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-ink">{item.title}</span>
            <span className="block truncate text-[11px] text-muted">{item.text}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
