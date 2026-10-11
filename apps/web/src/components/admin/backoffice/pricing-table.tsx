'use client';

import { Fragment, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Check, History, Loader2, Search, X } from 'lucide-react';
import {
  PRICE_ROUNDINGS,
  formatNumberFa,
  formatToman,
  type BulkPricePreviewDto,
  type PriceChangeDto,
  type PricingRowDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { formatDateFa, formatDateTimeFa } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { MoneyInput, parseAmount, useAction } from './inputs';

const ROUNDING_LABELS: Record<number, string> = {
  0: 'بدون گرد کردن',
  1_000: 'هزار تومان',
  10_000: 'ده هزار تومان',
  100_000: 'صد هزار تومان',
  1_000_000: 'میلیون تومان',
};

/** One price typed in place; Enter saves, Escape leaves it. */
function PriceCell({ row, canWrite }: { row: PricingRowDto; canWrite: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState<number | null>(row.price || null);
  const { pending, run } = useAction();
  if (!editing) {
    return (
      <button
        type="button"
        className={cn(
          'tabular text-start',
          canWrite && 'rounded-lg px-1.5 py-0.5 hover:bg-surface',
          row.price <= 0 && 'text-muted',
        )}
        onClick={() => canWrite && (setValue(row.price || null), setEditing(true))}
        disabled={!canWrite}
        aria-label={
          canWrite ? `ویرایش قیمت ${row.productName} ${row.storageLabel} ${row.colorName}` : undefined
        }
      >
        {row.price > 0 ? formatToman(row.price) : 'بدون قیمت'}
      </button>
    );
  }
  async function save() {
    if (!value || value === row.price) return setEditing(false);
    const done = await run(
      'save',
      () => api.patch(`/admin/variants/${row.variantId}`, { price: value }),
      `قیمت ${row.sku} ذخیره شد`,
    );
    if (done !== undefined) setEditing(false);
  }
  return (
    <div
      className="flex items-center gap-1"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          void save();
        }
        if (event.key === 'Escape') setEditing(false);
      }}
    >
      <MoneyInput
        value={value}
        onChange={setValue}
        showHint={false}
        className="w-36 [&_input]:h-9"
        autoFocus
        aria-label="قیمت تازه"
      />
      <Button size="icon-sm" variant="ghost" aria-label="ذخیره" onClick={save} loading={pending === 'save'}>
        {pending === 'save' ? null : <Check />}
      </Button>
      <Button size="icon-sm" variant="ghost" aria-label="انصراف" onClick={() => setEditing(false)}>
        <X />
      </Button>
    </div>
  );
}

function HistoryDialog({ row }: { row: PricingRowDto }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'price-history', row.variantId],
    queryFn: () => api.get<PriceChangeDto[]>('/admin/pricing/history', { variantId: row.variantId }),
    enabled: open,
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`تاریخچهٔ قیمت ${row.sku}`}>
          <History />
        </Button>
      </DialogTrigger>
      <DialogContent
        title="تاریخچهٔ قیمت"
        description={`${row.productName} ${row.storageLabel} ${row.colorName}`}
        className="max-h-[85dvh] overflow-y-auto"
      >
        {isLoading ? (
          <Loader2 className="mx-auto size-5 animate-spin text-muted" aria-hidden />
        ) : !data?.length ? (
          <p className="text-[13px] text-muted">از زمان راه‌اندازی تاریخچه، قیمت این مدل تغییر نکرده.</p>
        ) : (
          <ol className="grid gap-2 text-[12px]">
            {data.map((change) => (
              <li key={change.id} className="rounded-2xl bg-surface-2 px-3 py-2">
                <p className="tabular text-ink">
                  {formatToman(change.oldPrice)} ← {formatToman(change.newPrice)}
                </p>
                {change.oldCompareAt !== change.newCompareAt ? (
                  <p className="text-muted">
                    قبل از تخفیف: {change.oldCompareAt ? formatToman(change.oldCompareAt) : '—'} ←{' '}
                    {change.newCompareAt ? formatToman(change.newCompareAt) : '—'}
                  </p>
                ) : null}
                <p className="text-muted">
                  {formatDateTimeFa(change.createdAt)} · {change.adminName ?? '—'}
                  {change.batchId ? ' · تغییر گروهی' : ''}
                </p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** «تغییر گروهی قیمت» with a preview of every row before anything is saved. */
function BulkBar({ ids, onDone }: { ids: string[]; onDone: () => void }) {
  const [target, setTarget] = useState<'PRICE' | 'COMPARE_AT'>('PRICE');
  const [mode, setMode] = useState<'PERCENT' | 'AMOUNT' | 'SET'>('PERCENT');
  const [value, setValue] = useState('5');
  const [rounding, setRounding] = useState<number>(100_000);
  const [preview, setPreview] = useState<BulkPricePreviewDto | null>(null);
  const { pending, run } = useAction();
  const numeric =
    mode === 'PERCENT'
      ? Number(value.replace('٫', '.'))
      : (parseAmount(value.replace(/^-/, '')) ?? Number.NaN) * (value.trim().startsWith('-') ? -1 : 1);

  async function send(dryRun: boolean): Promise<BulkPricePreviewDto> {
    if (!Number.isFinite(numeric)) throw new Error('مقدار را درست وارد کن');
    const result = await api.post<BulkPricePreviewDto>('/admin/pricing/bulk', {
      variantIds: ids,
      target,
      mode,
      value: numeric,
      rounding,
      dryRun,
    });
    if (dryRun) setPreview(result);
    return result;
  }

  return (
    <div
      className="sticky top-16 z-20 grid gap-3 rounded-2xl border border-ink bg-canvas p-3 shadow-sm"
      role="region"
      aria-label="تغییر گروهی قیمت"
    >
      <div className="flex flex-wrap items-end gap-2">
        <span className="pb-2 text-[13px] text-ink">{formatNumberFa(ids.length)} ردیف</span>
        <label className="grid gap-1 text-[11px] text-muted">
          کدام قیمت
          <select
            className="h-9 rounded-pill border border-line bg-canvas px-3 text-[12px] text-ink"
            value={target}
            onChange={(event) => setTarget(event.target.value as typeof target)}
          >
            <option value="PRICE">قیمت فروش</option>
            <option value="COMPARE_AT">قیمت قبل از تخفیف</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted">
          چطور
          <select
            className="h-9 rounded-pill border border-line bg-canvas px-3 text-[12px] text-ink"
            value={mode}
            onChange={(event) => setMode(event.target.value as typeof mode)}
          >
            <option value="PERCENT">درصد (+ افزایش، − کاهش)</option>
            <option value="AMOUNT">مبلغ (+ افزایش، − کاهش)</option>
            <option value="SET">یک قیمت برای همه</option>
          </select>
        </label>
        <label className="grid gap-1 text-[11px] text-muted">
          {mode === 'PERCENT' ? 'درصد' : 'تومان'}
          <Input
            dir="ltr"
            className="h-9 w-32 font-display text-[12px]"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
        </label>
        <label className="grid gap-1 text-[11px] text-muted">
          گرد کردن به
          <select
            className="h-9 rounded-pill border border-line bg-canvas px-3 text-[12px] text-ink"
            value={rounding}
            onChange={(event) => setRounding(Number(event.target.value))}
          >
            {PRICE_ROUNDINGS.map((option) => (
              <option key={option} value={option}>
                {ROUNDING_LABELS[option]}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          variant="dark"
          loading={pending === 'preview'}
          onClick={() => run('preview', () => send(true))}
        >
          پیش‌نمایش
        </Button>
      </div>
      {preview ? (
        <div className="grid gap-2">
          <div className="max-h-72 overflow-y-auto rounded-2xl border border-line">
            <table className="w-full text-[12px]">
              <caption className="sr-only">پیش‌نمایش تغییر قیمت</caption>
              <thead className="sticky top-0 bg-surface-2 text-muted">
                <tr>
                  <th className="px-3 py-2 text-start font-medium">مدل</th>
                  <th className="px-3 py-2 text-start font-medium">حالا</th>
                  <th className="px-3 py-2 text-start font-medium">بعد</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => (
                  <tr key={row.variantId} className="border-t border-line">
                    <td className="px-3 py-1.5">{row.title}</td>
                    <td className="px-3 py-1.5 tabular text-muted">
                      {row.oldValue ? formatToman(row.oldValue) : '—'}
                    </td>
                    <td className="px-3 py-1.5 tabular text-ink">
                      {row.newValue ? formatToman(row.newValue) : 'حذف'}
                      {row.compareAtCleared ? (
                        <span className="ms-1 text-[11px] text-warning">(تخفیف برداشته می‌شود)</span>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {preview.skipped.map((row) => (
                  <tr key={row.variantId} className="border-t border-line text-muted">
                    <td className="px-3 py-1.5" colSpan={3}>
                      {row.sku || row.variantId}: {row.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              loading={pending === 'apply'}
              disabled={!preview.rows.length}
              onClick={async () => {
                const done = await run(
                  'apply',
                  () => send(false),
                  (result) => `${formatNumberFa(result.rows.length)} قیمت تغییر کرد`,
                );
                if (done) {
                  setPreview(null);
                  onDone();
                }
              }}
            >
              اعمال {formatNumberFa(preview.rows.length)} تغییر
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setPreview(null)}>
              بستن پیش‌نمایش
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** «جدول قیمت‌ها»: every colour and capacity of every model, with a price typed in place or changed in bulk. */
export function PricingTable({ rows, canWrite }: { rows: PricingRowDto[]; canWrite: boolean }) {
  const [filter, setFilter] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const visible = useMemo(() => {
    const needle = filter.trim();
    if (!needle) return rows;
    return rows.filter((row) =>
      `${row.productName} ${row.storageLabel} ${row.colorName} ${row.sku}`.includes(needle),
    );
  }, [rows, filter]);
  const groups = useMemo(() => {
    const map = new Map<string, PricingRowDto[]>();
    for (const row of visible) map.set(row.productName, [...(map.get(row.productName) ?? []), row]);
    return [...map.entries()];
  }, [visible]);
  const toggle = (ids: string[], on: boolean) =>
    setPicked((current) =>
      on ? [...new Set([...current, ...ids])] : current.filter((id) => !ids.includes(id)),
    );

  return (
    <div className="grid gap-3">
      <div className="relative max-w-md">
        <Search
          className="pointer-events-none absolute start-4 top-1/2 size-4 -translate-y-1/2 text-muted-faint"
          aria-hidden
        />
        <Input
          className="h-11 ps-11"
          placeholder="مدل، حافظه، رنگ یا SKU…"
          aria-label="فیلتر جدول قیمت"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
      </div>
      {canWrite && picked.length ? <BulkBar ids={picked} onDone={() => setPicked([])} /> : null}
      <div className="overflow-x-auto rounded-panel border border-line">
        <table className="w-full min-w-[52rem] border-collapse text-[13px]">
          <thead>
            <tr className="bg-surface-2 text-[12px] text-muted">
              {canWrite ? (
                <th className="w-10 border-b border-line px-3 py-3">
                  <input
                    type="checkbox"
                    className="size-4"
                    aria-label="انتخاب همه"
                    checked={visible.length > 0 && visible.every((row) => picked.includes(row.variantId))}
                    onChange={(event) =>
                      toggle(
                        visible.map((row) => row.variantId),
                        event.target.checked,
                      )
                    }
                  />
                </th>
              ) : null}
              <th className="border-b border-line px-3 py-3 text-start font-medium">رنگ و حافظه</th>
              <th className="border-b border-line px-3 py-3 text-start font-medium">قیمت فروش</th>
              <th className="border-b border-line px-3 py-3 text-start font-medium">قبل از تخفیف</th>
              <th className="border-b border-line px-3 py-3 text-start font-medium">موجودی</th>
              <th className="border-b border-line px-3 py-3 text-start font-medium">آخرین تغییر</th>
              <th className="w-10 border-b border-line" />
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 ? (
              <tr>
                <td colSpan={canWrite ? 7 : 6} className="px-4 py-10 text-center text-muted">
                  ردیفی پیدا نشد
                </td>
              </tr>
            ) : (
              groups.map(([product, items]) => (
                <Fragment key={product}>
                  <tr className="bg-surface">
                    {canWrite ? (
                      <td className="border-b border-line px-3 py-2">
                        <input
                          type="checkbox"
                          className="size-4"
                          aria-label={`انتخاب همهٔ ${product}`}
                          checked={items.every((row) => picked.includes(row.variantId))}
                          onChange={(event) =>
                            toggle(
                              items.map((row) => row.variantId),
                              event.target.checked,
                            )
                          }
                        />
                      </td>
                    ) : null}
                    <th
                      colSpan={6}
                      scope="colgroup"
                      className="border-b border-line px-3 py-2 text-start text-[13px] font-semibold text-ink"
                    >
                      {product}
                      {!items[0]!.productActive ? (
                        <Badge tone="outline" className="ms-2">
                          مخفی
                        </Badge>
                      ) : null}
                    </th>
                  </tr>
                  {items.map((row) => (
                    <tr
                      key={row.variantId}
                      className={cn('transition-colors hover:bg-surface-2', !row.active && 'text-muted')}
                    >
                      {canWrite ? (
                        <td className="border-b border-line px-3 py-2">
                          <input
                            type="checkbox"
                            className="size-4"
                            aria-label={`انتخاب ${row.sku}`}
                            checked={picked.includes(row.variantId)}
                            onChange={(event) => toggle([row.variantId], event.target.checked)}
                          />
                        </td>
                      ) : null}
                      <td className="border-b border-line px-3 py-2">
                        <span className="flex items-center gap-2">
                          <span
                            className="size-3.5 shrink-0 rounded-full border border-line"
                            style={{ background: row.colorHex }}
                            aria-hidden
                          />
                          {row.storageLabel} — {row.colorName}
                          {!row.active ? <Badge tone="outline">غیرفعال</Badge> : null}
                        </span>
                        <span className="block font-display text-[11px] text-muted-faint">{row.sku}</span>
                      </td>
                      <td className="border-b border-line px-3 py-2">
                        <PriceCell row={row} canWrite={canWrite} />
                      </td>
                      <td className="border-b border-line px-3 py-2 text-[12px] tabular">
                        {row.compareAtPrice ? (
                          <>
                            {formatToman(row.compareAtPrice)}
                            <span className="ms-1 text-[11px] text-success">
                              {formatNumberFa(row.discountPercent)}٪
                            </span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="border-b border-line px-3 py-2 text-[12px] tabular">
                        {formatNumberFa(row.available)}
                      </td>
                      <td className="border-b border-line px-3 py-2 text-[11px] text-muted">
                        {row.lastChange ? (
                          <>
                            {formatDateFa(row.lastChange.at)}
                            <span className="block">از {formatToman(row.lastChange.oldPrice)}</span>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="border-b border-line px-1 py-2">
                        <HistoryDialog row={row} />
                      </td>
                    </tr>
                  ))}
                </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
