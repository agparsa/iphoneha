import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import type { CreditRequestDto } from '@iphoneha/shared';
import { getAdminMe } from '@/lib/api/admin';
import { getStorefrontConfig } from '@/lib/api/endpoints';
import { apiGetOptional } from '@/lib/api/server';
import { PageHeader } from '@/components/admin/ui';
import { NewContractForm } from '@/components/admin/backoffice/new-contract-form';

export const metadata = { title: 'قرارداد اقساط تازه' };

export default async function NewContractPage({
  searchParams,
}: {
  searchParams: Promise<{ request?: string }>;
}) {
  const { request: requestId } = await searchParams;
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('installments.write')) notFound();
  const [config, request] = await Promise.all([
    getStorefrontConfig(),
    requestId && admin.permissions.includes('leads.read')
      ? apiGetOptional<CreditRequestDto>(`/admin/credit-requests/${encodeURIComponent(requestId)}`)
      : Promise.resolve(null),
  ]);

  return (
    <div>
      <Link
        href="/admin/installments?tab=contracts"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به قراردادها
      </Link>
      <PageHeader
        title="قرارداد اقساط تازه"
        description="برای فروشی که گوشی‌اش هنوز روی سفارش نرفته یا پیش از پنل انجام شده؛ فروش تازه را از «ثبت سفارش» بزن تا موجودی و IMEI هم ثبت شود."
      />
      <NewContractForm request={request} credit={config.credit} />
    </div>
  );
}
