import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, listShippingMethods } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, Td, Th } from '@/components/admin/ui';
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { ShippingMethodForm } from '@/components/admin/shipping-form';

export default async function AdminShippingPage() {
  const [methods, admin] = await Promise.all([listShippingMethods(), getAdminMe()]);
  const canWrite = admin?.permissions.includes('shipping.write') ?? false;

  return (
    <div>
      <PageHeader
        title="روش‌های ارسال"
        description="هزینه، آستانه ارسال رایگان و استان‌های تحت پوشش"
        action={canWrite ? <ShippingMethodForm /> : undefined}
      />

      <Table>
        <thead>
          <tr>
            <Th>نام</Th>
            <Th>کد</Th>
            <Th>محاسبه</Th>
            <Th>هزینه پایه</Th>
            <Th>ارسال رایگان از</Th>
            <Th>زمان تحویل</Th>
            <Th>استان‌ها</Th>
            <Th>وضعیت</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {methods.length === 0 ? (
            <EmptyRow colSpan={canWrite ? 9 : 8} />
          ) : (
            methods.map((method) => (
              <tr key={method.id}>
                <Td className="text-ink">{method.name}</Td>
                <Td className="whitespace-nowrap font-display text-[12px]">{method.code}</Td>
                <Td className="text-[12px]">{method.calculator === 'flat' ? 'ثابت' : 'پیک شهری'}</Td>
                <Td className="tabular whitespace-nowrap">{formatToman(method.baseCost)}</Td>
                <Td className="tabular whitespace-nowrap">
                  {method.freeThreshold ? formatToman(method.freeThreshold) : '—'}
                </Td>
                <Td className="text-[12px]">{method.etaLabel}</Td>
                <Td className="text-[12px]">
                  {method.allowedProvinces.length === 0
                    ? 'همه استان‌ها'
                    : `${formatNumberFa(method.allowedProvinces.length)} استان`}
                </Td>
                <Td>
                  <Badge tone={method.isActive ? 'success' : 'neutral'}>
                    {method.isActive ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </Td>
                {canWrite ? (
                  <Td>
                    <div className="flex items-center gap-1">
                      <ShippingMethodForm method={method} />
                      <ConfirmDelete
                        path={`/admin/shipping-methods/${method.id}`}
                        title={`حذف ${method.name}`}
                        description="اگر سفارشی با این روش ثبت شده باشد، به‌جای حذف غیرفعال می‌شود."
                      />
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>
    </div>
  );
}
