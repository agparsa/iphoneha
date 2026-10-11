import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { getAdminMe, listShippingMethods } from '@/lib/api/admin';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { PageHeader } from '@/components/admin/ui';
import { NewOrderForm } from '@/components/admin/backoffice/new-order-form';

export const metadata = { title: 'ثبت سفارش تلفنی یا حضوری' };

export default async function NewOrderPage() {
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('orders.create')) notFound();
  const [methods, config] = await Promise.all([
    admin.permissions.includes('shipping.read') ? listShippingMethods() : Promise.resolve([]),
    getStorefrontConfig(),
  ]);

  return (
    <div>
      <Link
        href="/admin/orders"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به سفارش‌ها
      </Link>
      <PageHeader
        title="ثبت سفارش تلفنی یا حضوری"
        description="فروش در فروشگاه یا پشت تلفن: قیمت از جدول قیمت، موجودی و IMEI از انبار، و پرداخت نقدی یا قرارداد اقساط"
      />
      <NewOrderForm
        shippingMethods={methods.filter((method) => method.isActive)}
        credit={config.credit}
        canLookupCustomers={admin.permissions.includes('users.read')}
      />
    </div>
  );
}
