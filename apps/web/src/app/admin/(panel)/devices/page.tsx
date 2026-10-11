import { notFound } from 'next/navigation';
import Link from 'next/link';
import { Download } from 'lucide-react';
import { DEVICE_UNIT_STATUSES, DEVICE_UNIT_STATUS_LABELS, formatToman } from '@iphoneha/shared';
import { getAdminMe, listDevices } from '@/lib/api/admin';
import { DEVICE_TONE, exportHref } from '@/lib/backoffice';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, FilterChips, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { DeviceActions, ReceiveDevicesDialog } from '@/components/admin/backoffice/device-dialogs';

export const metadata = { title: 'گوشی‌ها (IMEI)' };

type SearchParams = Promise<{ q?: string; status?: string; variantId?: string; page?: string }>;

export default async function DevicesPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('inventory.read')) notFound();
  const devices = await listDevices({
    q: params.q,
    status: params.status,
    variantId: params.variantId,
    page: params.page ?? '1',
    pageSize: '50',
  });
  const canWrite = Boolean(admin?.permissions.includes('inventory.write'));
  const canExport = Boolean(admin?.permissions.includes('reports.read'));

  return (
    <div>
      <PageHeader
        title="گوشی‌ها (IMEI)"
        description="هر گوشی با IMEI خودش: کی رسید، از کجا، به چه قیمتی، و روی کدام سفارش رفت"
        action={
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <a
                href={exportHref('devices')}
                className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
              >
                <Download className="size-4" aria-hidden />
                خروجی اکسل
              </a>
            ) : null}
            {canWrite ? <ReceiveDevicesDialog defaultVariantId={params.variantId ?? null} /> : null}
          </div>
        }
      />

      <div className="mb-4 grid gap-3">
        {params.variantId ? (
          <p className="flex flex-wrap items-center gap-2 text-[12px] text-muted">
            فقط گوشی‌های یک رنگ و حافظه
            {devices.items[0] ? ` (${devices.items[0].productName} — ${devices.items[0].variantTitle})` : ''}
            <Link href="/admin/devices" className="text-ink underline-offset-4 hover:underline">
              نمایش همه
            </Link>
          </p>
        ) : null}
        <AdminSearch placeholder="IMEI، سریال، مدل یا شماره سفارش…" />
        <FilterChips
          basePath="/admin/devices"
          params={params}
          name="status"
          label="وضعیت"
          options={DEVICE_UNIT_STATUSES.map((status) => ({
            value: status,
            label: DEVICE_UNIT_STATUS_LABELS[status],
          }))}
        />
      </div>

      <Table>
        <thead>
          <tr>
            <Th>IMEI</Th>
            <Th>مدل</Th>
            <Th>وضعیت</Th>
            <Th>قیمت خرید</Th>
            <Th>ورود</Th>
            <Th>سفارش</Th>
            {canWrite ? <Th className="w-24" /> : null}
          </tr>
        </thead>
        <tbody>
          {devices.items.length === 0 ? (
            <EmptyRow
              colSpan={canWrite ? 7 : 6}
              label={params.q ? 'گوشی‌ای با این مشخصات ثبت نشده' : 'هنوز گوشی‌ای با IMEI ثبت نشده'}
            />
          ) : (
            devices.items.map((device) => (
              <tr key={device.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <span className="block font-display text-ink tabular" dir="ltr">
                    {device.imei}
                  </span>
                  {device.imei2 ? (
                    <span className="block font-display text-[11px] text-muted" dir="ltr">
                      {device.imei2}
                    </span>
                  ) : null}
                  {device.serialNumber ? (
                    <span className="block font-display text-[11px] text-muted" dir="ltr">
                      S/N {device.serialNumber}
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <span className="block text-ink">{device.productName}</span>
                  <span className="block text-[11px] text-muted">{device.variantTitle}</span>
                </Td>
                <Td>
                  <Badge tone={DEVICE_TONE[device.status]}>{device.statusLabel}</Badge>
                  {device.note ? (
                    <span className="mt-1 block max-w-48 truncate text-[11px] text-muted" title={device.note}>
                      {device.note}
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular whitespace-nowrap text-[12px]">
                  {device.costPrice !== null ? formatToman(device.costPrice) : '—'}
                  {device.supplier ? (
                    <span className="block text-[11px] text-muted">{device.supplier}</span>
                  ) : null}
                </Td>
                <Td className="text-[12px]">
                  {formatDateFa(device.receivedAt)}
                  {device.receivedByName ? (
                    <span className="block text-[11px] text-muted">{device.receivedByName}</span>
                  ) : null}
                </Td>
                <Td className="text-[12px]">
                  {device.order ? (
                    <Link
                      href={`/admin/orders/${device.order.id}`}
                      className="font-display text-ink hover:underline"
                    >
                      {device.order.orderNumber}
                    </Link>
                  ) : (
                    '—'
                  )}
                  {device.order ? (
                    <span className="block text-[11px] text-muted">{device.order.customerName}</span>
                  ) : null}
                </Td>
                {canWrite ? (
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <DeviceActions device={device} />
                      {device.status === 'IN_STOCK' && !device.soldAt ? (
                        <ConfirmDelete
                          path={`/admin/devices/${device.id}`}
                          title={`حذف گوشی ${device.imei}`}
                          description="اگر این IMEI اشتباهی ثبت شده، حذفش کن؛ موجودی همین مدل یک عدد کم می‌شود."
                        />
                      ) : null}
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={devices.page}
        totalPages={devices.totalPages}
        total={devices.total}
        basePath="/admin/devices"
        params={params}
      />
    </div>
  );
}
