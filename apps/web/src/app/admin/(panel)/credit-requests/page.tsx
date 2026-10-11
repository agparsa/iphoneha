import Link from 'next/link';
import { ExternalLink, Phone } from 'lucide-react';
import {
  CREDIT_REQUEST_STATUSES,
  CREDIT_REQUEST_STATUS_LABELS,
  formatNumberFa,
  type CreditRequestDto,
  type CreditRequestStatus,
} from '@iphoneha/shared';
import { getAdminMe, listCreditRequests } from '@/lib/api/admin';
import { formatDateTimeFa, telHref } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PageHeader, TablePagination } from '@/components/admin/ui';
import { CreditRequestActions } from '@/components/admin/credit-request-actions';
import { BrowserAlertsToggle } from '@/components/admin/browser-alerts';

type SearchParams = Promise<{ status?: string; page?: string }>;

const STATUS_TONES: Record<CreditRequestStatus, 'info' | 'warning' | 'success' | 'neutral'> = {
  NEW: 'info',
  CONTACTED: 'warning',
  CONTRACTED: 'success',
  CANCELLED: 'neutral',
};

/** Which page the form was sent from, in words. */
function sourceLabel(source: string): string {
  if (source === '/installments/cheque') return 'صفحهٔ خرید با چک';
  if (source === '/installments/safte') return 'صفحهٔ خرید با سفته';
  if (source.startsWith('/installments')) return 'صفحهٔ آیفون قسطی';
  if (source.startsWith('/iphone/')) return 'صفحهٔ محصول';
  if (source.startsWith('/mag')) return 'مجله';
  return source;
}

function isStatus(value: string | undefined): value is CreditRequestStatus {
  return CREDIT_REQUEST_STATUSES.includes(value as CreditRequestStatus);
}

export default async function AdminCreditRequestsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const status = isStatus(params.status) ? params.status : undefined;
  const [list, admin] = await Promise.all([
    listCreditRequests({ status, page: params.page ?? '1', pageSize: '20' }),
    getAdminMe(),
  ]);
  const canWrite = admin?.permissions.includes('leads.write') ?? false;
  const canContract = admin?.permissions.includes('installments.write') ?? false;
  const canSeeSettings = admin?.permissions.includes('settings.read') ?? false;
  const all = Object.values(list.counts).reduce((sum, count) => sum + count, 0);

  return (
    <div>
      <PageHeader
        title="درخواست‌های خرید اقساطی"
        description="فرم‌های «خرید با چک صیادی و سفته»؛ با مشتری تماس بگیر و وضعیت را همین‌جا به‌روز کن"
        action={
          <div className="flex flex-wrap items-center gap-3">
            <BrowserAlertsToggle compact />
            {canSeeSettings ? (
              <Link
                href="/admin/settings?tab=alerts"
                className="text-[12px] text-muted underline-offset-4 hover:text-ink hover:underline"
              >
                پیامک و ربات هشدار
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="no-scrollbar mb-4 flex gap-2 overflow-x-auto">
        <StatusChip label="همه" count={all} href="/admin/credit-requests" active={!status} />
        {CREDIT_REQUEST_STATUSES.map((option) => (
          <StatusChip
            key={option}
            label={CREDIT_REQUEST_STATUS_LABELS[option]}
            count={list.counts[option]}
            href={`/admin/credit-requests?status=${option}`}
            active={status === option}
          />
        ))}
      </div>

      {list.items.length === 0 ? (
        <div className="rounded-panel border border-dashed border-line px-5 py-12 text-center">
          <p className="text-[14px] font-medium text-ink">
            {status
              ? `درخواستی با وضعیت «${CREDIT_REQUEST_STATUS_LABELS[status]}» نیست`
              : 'هنوز درخواستی ثبت نشده است'}
          </p>
          <p className="mt-2 text-[12px] leading-6 text-muted">
            فرم درخواست در صفحه‌های{' '}
            <Link
              href="/installments"
              className="text-ink underline-offset-4 hover:underline"
              target="_blank"
            >
              آیفون قسطی
            </Link>
            ،{' '}
            <Link
              href="/installments/cheque"
              className="text-ink underline-offset-4 hover:underline"
              target="_blank"
            >
              خرید با چک
            </Link>{' '}
            و{' '}
            <Link
              href="/installments/safte"
              className="text-ink underline-offset-4 hover:underline"
              target="_blank"
            >
              خرید با سفته
            </Link>{' '}
            است.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3">
          {list.items.map((request) => (
            <li key={request.id}>
              <RequestCard request={request} canWrite={canWrite} canContract={canContract} />
            </li>
          ))}
        </ul>
      )}

      <TablePagination
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        basePath="/admin/credit-requests"
        params={{ status }}
      />
    </div>
  );
}

function RequestCard({
  request,
  canWrite,
  canContract,
}: {
  request: CreditRequestDto;
  canWrite: boolean;
  canContract: boolean;
}) {
  return (
    <article className="rounded-panel border border-line bg-canvas p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] text-muted">
            درخواست <span className="tabular">{formatNumberFa(request.number)}</span> ·{' '}
            {formatDateTimeFa(request.createdAt)}
          </p>
          <h2 className="mt-1 text-[15px] font-semibold text-ink">{request.name}</h2>
          <a
            href={telHref(request.phone)}
            className="mt-1 inline-flex items-center gap-1.5 text-[13px] text-brand-ink hover:underline"
          >
            <Phone className="size-3.5" aria-hidden />
            <span dir="ltr" className="font-display">
              {request.phone}
            </span>
          </a>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="outline">{request.methodLabel}</Badge>
          <Badge tone={STATUS_TONES[request.status]}>{request.statusLabel}</Badge>
          {canContract && request.status !== 'CONTRACTED' && request.status !== 'CANCELLED' ? (
            <Link
              href={`/admin/installments/new?request=${request.id}`}
              className="inline-flex h-8 items-center rounded-pill bg-ink px-3 text-[12px] text-white hover:bg-ink-soft"
            >
              نوشتن قرارداد
            </Link>
          ) : null}
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
        <Item label="مدل">
          {request.product ? (
            <Link
              href={`/iphone/${request.product.slug}`}
              target="_blank"
              className="inline-flex items-center gap-1 text-ink hover:underline"
            >
              {request.product.name}
              <ExternalLink className="size-3" aria-hidden />
            </Link>
          ) : (
            (request.productName ?? 'انتخاب نکرده')
          )}
        </Item>
        <Item label="تعداد اقساط">
          {request.months ? `${formatNumberFa(request.months)} ماه` : 'انتخاب نکرده'}
        </Item>
        <Item label="شهر">{request.city ?? '—'}</Item>
        <Item label="ثبت از">{request.source ? sourceLabel(request.source) : '—'}</Item>
      </dl>

      {request.note ? (
        <p className="mt-4 rounded-2xl bg-surface-2 px-3.5 py-2.5 text-[13px] leading-6 text-ink-muted">
          <span className="text-muted">توضیح مشتری: </span>
          {request.note}
        </p>
      ) : null}

      {request.handledBy && request.handledAt ? (
        <p className="mt-3 text-[11px] text-muted">
          آخرین تغییر وضعیت: {request.handledBy} — {formatDateTimeFa(request.handledAt)}
        </p>
      ) : null}

      {canWrite ? (
        <CreditRequestActions
          id={request.id}
          number={request.number}
          status={request.status}
          adminNote={request.adminNote}
        />
      ) : request.adminNote ? (
        <p className="mt-3 text-[12px] text-ink-muted">یادداشت: {request.adminNote}</p>
      ) : null}
    </article>
  );
}

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted">{label}</dt>
      <dd className="mt-0.5 truncate text-ink-muted">{children}</dd>
    </div>
  );
}

function StatusChip({
  label,
  count,
  href,
  active,
}: {
  label: string;
  count: number;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[12px] transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted hover:bg-surface'
      }`}
    >
      {label}
      <span className={`tabular ${active ? 'text-white/70' : 'text-muted'}`}>{formatNumberFa(count)}</span>
    </Link>
  );
}
