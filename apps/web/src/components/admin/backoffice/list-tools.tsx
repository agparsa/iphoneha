'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  ADMIN_ORDER_TRANSITIONS,
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  addDaysIso,
  formatNumberFa,
  formatToman,
  jalaliMonthRange,
  isoToJalali,
  paymentMethodName,
  tehranToday,
  type AdminOrderListItem,
  type BulkOrderStatusResultDto,
  type OrderStatus,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { orderTone } from '@/lib/backoffice';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyRow, Table, Td, Th } from '@/components/admin/ui';
import { JalaliDateInput, formError } from './inputs';

/** Presets and a custom range of Tehran days, written into the URL as `from` and `to`. */
export function DateRangeFilter({ label = 'بازه' }: { label?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [from, setFrom] = useState<string | null>(searchParams.get('from'));
  const [to, setTo] = useState<string | null>(searchParams.get('to'));

  function apply(nextFrom: string | null, nextTo: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextFrom) params.set('from', nextFrom);
    else params.delete('from');
    if (nextTo) params.set('to', nextTo);
    else params.delete('to');
    params.delete('page');
    setFrom(nextFrom);
    setTo(nextTo);
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  const today = tehranToday();
  const { jy, jm } = isoToJalali(today);
  const thisMonth = jalaliMonthRange(jy, jm);
  const lastMonth = jalaliMonthRange(jm === 1 ? jy - 1 : jy, jm === 1 ? 12 : jm - 1);
  const presets = [
    { label: 'امروز', from: today, to: today },
    { label: '۷ روز', from: addDaysIso(today, -6), to: today },
    { label: '۳۰ روز', from: addDaysIso(today, -29), to: today },
    { label: 'این ماه', from: thisMonth.from, to: today },
    { label: 'ماه قبل', from: lastMonth.from, to: lastMonth.to },
  ];
  const active = (preset: { from: string; to: string }) =>
    preset.from === searchParams.get('from') && preset.to === searchParams.get('to');

  return (
    <div className="flex flex-wrap items-start gap-2">
      <span className="pt-2 text-[12px] text-muted">{label}:</span>
      {presets.map((preset) => (
        <button
          key={preset.label}
          type="button"
          onClick={() => apply(preset.from, preset.to)}
          className={`rounded-pill border px-3 py-1.5 text-[12px] ${active(preset) ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface'}`}
          aria-pressed={active(preset)}
        >
          {preset.label}
        </button>
      ))}
      <form
        className="flex flex-wrap items-start gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          apply(from, to ?? from);
        }}
      >
        <JalaliDateInput
          aria-label="از تاریخ"
          className="w-36 [&_input]:h-9 [&_input]:text-[12px]"
          value={from}
          onChange={setFrom}
          allowEmpty
          todayButton={false}
        />
        <JalaliDateInput
          aria-label="تا تاریخ"
          className="w-36 [&_input]:h-9 [&_input]:text-[12px]"
          value={to}
          onChange={setTo}
          allowEmpty
          todayButton={false}
        />
        <Button type="submit" size="sm" variant="outline">
          اعمال
        </Button>
        {searchParams.get('from') || searchParams.get('to') ? (
          <Button type="button" size="sm" variant="ghost" onClick={() => apply(null, null)}>
            همهٔ تاریخ‌ها
          </Button>
        ) : null}
      </form>
    </div>
  );
}

/** A select that writes one query parameter into the URL. */
export function ParamSelect({
  name,
  label,
  options,
  allLabel = 'همه',
}: {
  name: string;
  label: string;
  options: { value: string; label: string }[];
  allLabel?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-[12px] text-muted">
      {label}
      <select
        className="h-9 rounded-pill border border-line bg-canvas px-3 text-[12px] text-ink"
        value={searchParams.get(name) ?? ''}
        onChange={(event) => {
          const params = new URLSearchParams(searchParams.toString());
          if (event.target.value) params.set(name, event.target.value);
          else params.delete(name);
          params.delete('page');
          const query = params.toString();
          router.push(query ? `${pathname}?${query}` : pathname);
        }}
      >
        <option value="">{allLabel}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** The orders list with a checkbox per row and «تغییر وضعیت گروهی» for the ones ticked. */
export function OrdersTable({ orders, canBulk }: { orders: AdminOrderListItem[]; canBulk: boolean }) {
  const router = useRouter();
  const [picked, setPicked] = useState<string[]>([]);
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [pending, setPending] = useState(false);
  const chosen = orders.filter((order) => picked.includes(order.id));
  // the statuses every ticked order can move to
  const targets = ORDER_STATUSES.filter(
    (target) =>
      chosen.length > 0 && chosen.every((order) => ADMIN_ORDER_TRANSITIONS[order.status].includes(target)),
  );

  async function apply() {
    if (!status || !picked.length) return;
    setPending(true);
    try {
      const result = await api.post<BulkOrderStatusResultDto>('/admin/orders/bulk-status', {
        orderIds: picked,
        status,
        note: note.trim() || null,
      });
      if (result.updated.length)
        toast.success(`${formatNumberFa(result.updated.length)} سفارش «${ORDER_STATUS_LABELS[status]}» شد`);
      for (const failure of result.failed) toast.error(`${failure.orderNumber ?? ''}: ${failure.message}`);
      setPicked([]);
      setStatus('');
      setNote('');
      router.refresh();
    } catch (error) {
      toast.error(formError(error));
    } finally {
      setPending(false);
    }
  }

  const allPicked = orders.length > 0 && picked.length === orders.length;
  return (
    <div className="grid gap-3">
      {canBulk && picked.length ? (
        <div
          className="sticky top-16 z-20 flex flex-wrap items-center gap-2 rounded-2xl border border-ink bg-canvas p-3 shadow-sm"
          role="region"
          aria-label="تغییر وضعیت گروهی"
        >
          <span className="text-[13px] text-ink">{formatNumberFa(picked.length)} سفارش انتخاب شده</span>
          <select
            aria-label="وضعیت تازه"
            className="h-9 rounded-pill border border-line bg-canvas px-3 text-[12px]"
            value={status}
            onChange={(event) => setStatus(event.target.value as OrderStatus)}
          >
            <option value="">{targets.length ? 'وضعیت تازه…' : 'وضعیت مشترکی برای این‌ها نیست'}</option>
            {targets.map((target) => (
              <option key={target} value={target}>
                {ORDER_STATUS_LABELS[target]}
              </option>
            ))}
          </select>
          <Input
            aria-label="یادداشت"
            className="h-9 w-48 text-[12px]"
            placeholder="یادداشت (اختیاری)"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
          <Button size="sm" onClick={apply} loading={pending} disabled={!status}>
            اعمال
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setPicked([])}>
            لغو انتخاب
          </Button>
        </div>
      ) : null}
      <Table>
        <thead>
          <tr>
            {canBulk ? (
              <Th className="w-10">
                <input
                  type="checkbox"
                  className="size-4"
                  aria-label="انتخاب همهٔ سفارش‌های این صفحه"
                  checked={allPicked}
                  onChange={() => setPicked(allPicked ? [] : orders.map((order) => order.id))}
                />
              </Th>
            ) : null}
            <Th>شماره</Th>
            <Th>مشتری</Th>
            <Th>وضعیت</Th>
            <Th>روش پرداخت</Th>
            <Th>تاریخ</Th>
            <Th>مبلغ</Th>
          </tr>
        </thead>
        <tbody>
          {orders.length === 0 ? (
            <EmptyRow colSpan={canBulk ? 7 : 6} />
          ) : (
            orders.map((order) => (
              <tr key={order.id} className="transition-colors hover:bg-surface-2">
                {canBulk ? (
                  <Td>
                    <input
                      type="checkbox"
                      className="size-4"
                      aria-label={`انتخاب سفارش ${order.orderNumber}`}
                      checked={picked.includes(order.id)}
                      onChange={() =>
                        setPicked((current) =>
                          current.includes(order.id)
                            ? current.filter((id) => id !== order.id)
                            : [...current, order.id],
                        )
                      }
                    />
                  </Td>
                ) : null}
                <Td>
                  <Link href={`/admin/orders/${order.id}`} className="font-display text-ink hover:underline">
                    {order.orderNumber}
                  </Link>
                  {order.source !== 'WEBSITE' ? (
                    <span className="mt-0.5 block text-[11px] text-info">
                      {order.source === 'IN_STORE' ? 'حضوری' : 'تلفنی'}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <span className="block text-ink">{order.customerName}</span>
                  <span className="block font-display text-[11px] text-muted">{order.customerPhone}</span>
                </Td>
                <Td>
                  <Badge tone={orderTone(order.status)}>{order.statusLabel}</Badge>
                </Td>
                <Td className="text-[12px]">{paymentMethodName(order.paymentMethod)}</Td>
                <Td className="text-[12px]">{formatDateFa(order.createdAt)}</Td>
                <Td className="whitespace-nowrap tabular">
                  {formatToman(order.total)}
                  <span className="block text-[11px] text-muted-faint">
                    {formatNumberFa(order.itemsCount)} کالا
                  </span>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
