import { DISCOUNT_TYPE_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, listCoupons, listDiscounts } from '@/lib/api/admin';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, Td, Th } from '@/components/admin/ui';
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { DiscountForm } from '@/components/admin/discount-form';
import { CouponForm } from '@/components/admin/coupon-form';

export default async function AdminDiscountsPage() {
  const [discounts, coupons, admin] = await Promise.all([
    listDiscounts({ page: 1, pageSize: 50 }),
    listCoupons({ page: 1, pageSize: 50 }),
    getAdminMe(),
  ]);
  const canWrite = admin?.permissions.includes('discounts.write') ?? false;

  return (
    <div>
      <PageHeader
        title="تخفیف‌ها و کدها"
        description="تعریف تخفیف و کدهای تخفیف قابل استفاده در سبد خرید"
        action={canWrite ? <DiscountForm /> : undefined}
      />

      <Table>
        <thead>
          <tr>
            <Th>نام</Th>
            <Th>نوع</Th>
            <Th>مقدار</Th>
            <Th>حداقل سبد</Th>
            <Th>بازه</Th>
            <Th>کدها</Th>
            <Th>وضعیت</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {discounts.items.length === 0 ? (
            <EmptyRow colSpan={canWrite ? 8 : 7} label="تخفیفی تعریف نشده است" />
          ) : (
            discounts.items.map((discount) => (
              <tr key={discount.id}>
                <Td className="text-ink">{discount.name}</Td>
                <Td className="text-[12px]">{DISCOUNT_TYPE_LABELS[discount.type]}</Td>
                <Td className="tabular whitespace-nowrap">
                  {discount.type === 'PERCENT'
                    ? `${formatNumberFa(discount.value)}٪`
                    : formatToman(discount.value)}
                  {discount.maxDiscount ? (
                    <span className="block text-[11px] text-muted-faint">
                      سقف {formatToman(discount.maxDiscount)}
                    </span>
                  ) : null}
                </Td>
                <Td className="tabular whitespace-nowrap">
                  {discount.minOrderAmount ? formatToman(discount.minOrderAmount) : '—'}
                </Td>
                <Td className="text-[12px]">
                  {discount.startsAt ? formatDateFa(discount.startsAt) : '—'} تا{' '}
                  {discount.endsAt ? formatDateFa(discount.endsAt) : '—'}
                </Td>
                <Td className="tabular whitespace-nowrap">{formatNumberFa(discount.couponsCount)}</Td>
                <Td>
                  <Badge tone={discount.isActive ? 'success' : 'neutral'}>
                    {discount.isActive ? 'فعال' : 'غیرفعال'}
                  </Badge>
                </Td>
                {canWrite ? (
                  <Td>
                    <div className="flex items-center gap-1">
                      <DiscountForm discount={discount} />
                      <ConfirmDelete
                        path={`/admin/discounts/${discount.id}`}
                        title={`حذف ${discount.name}`}
                        description="اگر کدی به این تخفیف وصل باشد، به‌جای حذف غیرفعال می‌شود."
                      />
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <section className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-ink">کدهای تخفیف</h2>
          {canWrite ? <CouponForm discounts={discounts.items} /> : null}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>کد</Th>
              <Th>تخفیف</Th>
              <Th>سقف استفاده</Th>
              <Th>هر کاربر</Th>
              <Th>استفاده‌شده</Th>
              <Th>وضعیت</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {coupons.items.length === 0 ? (
              <EmptyRow colSpan={canWrite ? 7 : 6} label="کدی تعریف نشده است" />
            ) : (
              coupons.items.map((coupon) => (
                <tr key={coupon.id}>
                  <Td className="font-display text-ink">{coupon.code}</Td>
                  <Td className="text-[12px]">{coupon.discountName}</Td>
                  <Td className="tabular whitespace-nowrap">
                    {coupon.usageLimit ? formatNumberFa(coupon.usageLimit) : 'نامحدود'}
                  </Td>
                  <Td className="tabular whitespace-nowrap">{formatNumberFa(coupon.perUserLimit)}</Td>
                  <Td className="tabular whitespace-nowrap">{formatNumberFa(coupon.usedCount)}</Td>
                  <Td>
                    <Badge tone={coupon.isActive ? 'success' : 'neutral'}>
                      {coupon.isActive ? 'فعال' : 'غیرفعال'}
                    </Badge>
                  </Td>
                  {canWrite ? (
                    <Td>
                      <CouponForm discounts={discounts.items} coupon={coupon} />
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
