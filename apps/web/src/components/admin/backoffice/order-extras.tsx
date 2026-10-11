'use client';

import { useMemo, useState } from 'react';
import { useQueries } from '@tanstack/react-query';
import { Loader2, ScanBarcode } from 'lucide-react';
import {
  digitsOnly,
  formatNumberFa,
  type AdminOrderDto,
  type DeviceUnitDto,
  type Paginated,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { useAction } from './inputs';

/**
 * «ثبت IMEI»: which phones leave the store on each line of the order. The
 * phones on the shelf for each colour and capacity are listed; typing the
 * last digits of an IMEI narrows the list (a barcode scan types all of it).
 */
export function OrderDevicesDialog({ order }: { order: AdminOrderDto }) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const initial = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const item of order.items)
      map[item.id] = order.devices.filter((d) => d.orderItemId === item.id).map((d) => d.id);
    return map;
  }, [order]);
  const [chosen, setChosen] = useState<Record<string, string[]>>(initial);
  const { pending, run } = useAction();

  const lines = order.items.filter((item) => item.variantId);
  const shelves = useQueries({
    queries: lines.map((item) => ({
      queryKey: ['admin', 'devices', 'in-stock', item.variantId],
      queryFn: () =>
        api.get<Paginated<DeviceUnitDto>>('/admin/devices', {
          variantId: item.variantId!,
          status: 'IN_STOCK',
          pageSize: 200,
        }),
      enabled: open,
    })),
  });
  const needle = digitsOnly(filter);

  function toggle(itemId: string, deviceId: string, limit: number) {
    setChosen((current) => {
      const list = current[itemId] ?? [];
      if (list.includes(deviceId)) return { ...current, [itemId]: list.filter((id) => id !== deviceId) };
      if (list.length >= limit) return current;
      return { ...current, [itemId]: [...list, deviceId] };
    });
  }

  async function save() {
    const done = await run(
      'save',
      () =>
        api.put(`/admin/orders/${order.id}/devices`, {
          assignments: lines.map((item) => ({ orderItemId: item.id, deviceIds: chosen[item.id] ?? [] })),
        }),
      'IMEIهای سفارش ثبت شد',
    );
    if (done !== undefined) setOpen(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setChosen(initial);
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <ScanBarcode aria-hidden />
          {order.devices.length ? 'ویرایش IMEI' : 'ثبت IMEI'}
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`IMEI گوشی‌های سفارش ${order.orderNumber}`}
        description="گوشی‌هایی که از انبار تحویل مشتری می‌شوند؛ روی فاکتور هم چاپ می‌شوند."
        className="max-h-[90dvh] max-w-xl overflow-y-auto"
      >
        <div className="grid gap-4">
          <Field label="جست‌وجوی IMEI" htmlFor="imei-filter" hint="چند رقم آخر یا اسکن بارکد">
            <Input
              id="imei-filter"
              dir="ltr"
              inputMode="numeric"
              className="font-display"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
          </Field>
          {lines.map((item, index) => {
            const shelf = shelves[index];
            const assigned = order.devices.filter((d) => d.orderItemId === item.id);
            const options = [
              ...assigned.map((d) => ({ id: d.id, imei: d.imei, serialNumber: d.serialNumber })),
              ...(shelf?.data?.items ?? []).map((d) => ({
                id: d.id,
                imei: d.imei,
                serialNumber: d.serialNumber,
              })),
            ].filter((d) => !needle || d.imei.includes(needle) || (chosen[item.id] ?? []).includes(d.id));
            const picked = chosen[item.id] ?? [];
            return (
              <fieldset key={item.id} className="rounded-2xl border border-line p-3">
                <legend className="px-1 text-[13px] font-medium text-ink">
                  {item.productName} — {item.variantTitle}
                  <span className="ms-2 text-[11px] text-muted">
                    {formatNumberFa(picked.length)} از {formatNumberFa(item.quantity)}
                  </span>
                </legend>
                {shelf?.isLoading ? (
                  <p className="flex items-center gap-2 py-3 text-[12px] text-muted">
                    <Loader2 className="size-4 animate-spin" aria-hidden /> در حال خواندن انبار…
                  </p>
                ) : options.length === 0 ? (
                  <p className="py-3 text-[12px] text-muted">
                    گوشی با IMEI از این مدل در انبار نیست؛ اول از «گوشی‌ها ← ورود کالا با IMEI» ثبتش کن.
                  </p>
                ) : (
                  <ul className="grid max-h-56 gap-1 overflow-y-auto">
                    {options.map((device) => {
                      const checked = picked.includes(device.id);
                      return (
                        <li key={device.id}>
                          <label className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-surface">
                            <input
                              type="checkbox"
                              className="size-4 accent-[var(--color-ink)]"
                              checked={checked}
                              disabled={!checked && picked.length >= item.quantity}
                              onChange={() => toggle(item.id, device.id, item.quantity)}
                            />
                            <span className="font-display text-[13px] text-ink tabular" dir="ltr">
                              {device.imei}
                            </span>
                            {device.serialNumber ? (
                              <span className="font-display text-[11px] text-muted" dir="ltr">
                                {device.serialNumber}
                              </span>
                            ) : null}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </fieldset>
            );
          })}
          <Button onClick={save} loading={pending === 'save'}>
            ذخیره IMEIها
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** The staff's own note on an order; the customer never sees it. */
export function OrderNoteForm({ orderId, note }: { orderId: string; note: string | null }) {
  const [value, setValue] = useState(note ?? '');
  const { pending, run } = useAction();
  const changed = value.trim() !== (note ?? '');
  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        await run(
          'note',
          () => api.patch(`/admin/orders/${orderId}/note`, { adminNote: value.trim() || null }),
          'یادداشت ذخیره شد',
        );
      }}
      className="grid gap-3"
    >
      <Field label="یادداشت داخلی (مشتری نمی‌بیند)" htmlFor="admin-note">
        <Textarea
          id="admin-note"
          rows={3}
          maxLength={1000}
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </Field>
      <Button type="submit" size="sm" variant="outline" loading={pending === 'note'} disabled={!changed}>
        ذخیره یادداشت
      </Button>
    </form>
  );
}
