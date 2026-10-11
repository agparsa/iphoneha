import { notFound } from 'next/navigation';
import Link from 'next/link';
import { AlertTriangle, Download, Plus } from 'lucide-react';
import {
  CHEQUE_STATUSES,
  CHEQUE_STATUS_LABELS,
  CONTRACT_STATUSES,
  CONTRACT_STATUS_LABELS,
  CREDIT_METHODS,
  CREDIT_METHOD_LABELS,
  formatJalali,
  formatNumberFa,
  formatToman,
  type Permission,
} from '@iphoneha/shared';
import { getAdminMe, getLedgerSummary, listCheques, listContracts, listDues } from '@/lib/api/admin';
import { CHEQUE_TONE, CONTRACT_TONE, dueLabel, exportHref } from '@/lib/backoffice';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import {
  EmptyRow,
  FilterChips,
  PageHeader,
  StatCard,
  Table,
  TablePagination,
  Td,
  Th,
} from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import {
  ChequeActionDialog,
  RecordPaymentDialog,
  RemindButton,
} from '@/components/admin/backoffice/ledger-actions';

export const metadata = { title: 'دفتر اقساط' };

type Tab = 'dues' | 'cheques' | 'contracts';
type SearchParams = Promise<{
  tab?: string;
  days?: string;
  method?: string;
  status?: string;
  overdue?: string;
  dueWithin?: string;
  q?: string;
  page?: string;
}>;

const TABS: { id: Tab; label: string }[] = [
  { id: 'dues', label: 'سررسیدها' },
  { id: 'cheques', label: 'چک‌ها' },
  { id: 'contracts', label: 'قراردادها' },
];

export default async function InstallmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const tab: Tab = params.tab === 'cheques' || params.tab === 'contracts' ? params.tab : 'dues';
  const admin = await getAdminMe();
  if (!admin?.permissions.includes('installments.read')) notFound();
  const summary = await getLedgerSummary();
  const can = (permission: Permission) => Boolean(admin?.permissions.includes(permission));
  const canWrite = can('installments.write');

  return (
    <div>
      <PageHeader
        title="دفتر اقساط"
        description="فروش اقساطی خود فروشگاه با چک صیادی و سفته: سررسیدها، چک‌ها و قراردادها"
        action={
          <div className="flex flex-wrap gap-2">
            {can('reports.read') ? (
              <>
                <a
                  href={exportHref('installments')}
                  className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
                >
                  <Download className="size-4" aria-hidden />
                  اکسل اقساط
                </a>
                <a
                  href={exportHref('cheques')}
                  className="inline-flex h-9 items-center gap-2 rounded-pill border border-line-strong px-4 text-[13px] text-ink hover:bg-surface"
                >
                  <Download className="size-4" aria-hidden />
                  اکسل چک‌ها
                </a>
              </>
            ) : null}
            {canWrite ? (
              <Link
                href="/admin/installments/new"
                className="inline-flex h-9 items-center gap-2 rounded-pill bg-brand-strong px-4 text-[13px] font-medium text-white hover:bg-brand-ink"
              >
                <Plus className="size-4" aria-hidden />
                قرارداد تازه
              </Link>
            ) : null}
          </div>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard
          label="ماندهٔ کل اقساط"
          value={formatToman(summary.outstanding)}
          hint={`${formatNumberFa(summary.activeContracts)} قرارداد فعال`}
        />
        <StatCard
          label="معوق"
          value={formatToman(summary.overdue.amount)}
          hint={`${formatNumberFa(summary.overdue.count)} قسط`}
          tone={summary.overdue.count ? 'danger' : 'neutral'}
        />
        <StatCard
          label="سررسید ۷ روز آینده"
          value={formatToman(summary.dueNext7Days.amount)}
          hint={`${formatNumberFa(summary.dueNext7Days.count)} قسط`}
        />
        <StatCard
          label="چک برای خواباندن تا ۷ روز"
          value={formatNumberFa(summary.chequesToDeposit.count)}
          hint={formatToman(summary.chequesToDeposit.amount)}
        />
        <StatCard
          label="چک برگشتی"
          value={formatNumberFa(summary.bouncedCheques.count)}
          hint={formatToman(summary.bouncedCheques.amount)}
          tone={summary.bouncedCheques.count ? 'danger' : 'neutral'}
        />
      </div>

      {!summary.remindersReady ? (
        <p
          className="mb-4 flex items-start gap-2 rounded-2xl bg-warning-soft px-4 py-3 text-[12px] text-warning"
          role="status"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          پیامک یادآوری قسط هنوز روی سرور راه نیفتاده: الگوی «یادآوری قسط قرارداد {'{0}'} به مبلغ {'{1}'}{' '}
          تومان با سررسید {'{2}'}» را در ملی‌پیامک بساز و کدش را با deploy/alerts.sh روی سرور وارد کن؛ بعد
          روشن کردنش در «تنظیمات ← دفتر اقساط» است.
        </p>
      ) : null}

      <nav className="mb-4 flex gap-1 border-b border-line" aria-label="بخش‌های دفتر اقساط">
        {TABS.map((item) => (
          <Link
            key={item.id}
            href={item.id === 'dues' ? '/admin/installments' : `/admin/installments?tab=${item.id}`}
            aria-current={tab === item.id ? 'page' : undefined}
            className={cn(
              '-mb-px border-b-2 px-4 py-2.5 text-[13px] transition-colors',
              tab === item.id
                ? 'border-ink font-medium text-ink'
                : 'border-transparent text-muted hover:text-ink',
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>

      {tab === 'dues' ? (
        <Dues params={params} canWrite={canWrite} remindersReady={summary.remindersReady} />
      ) : null}
      {tab === 'cheques' ? <Cheques params={params} canWrite={canWrite} /> : null}
      {tab === 'contracts' ? <Contracts params={params} /> : null}
    </div>
  );
}

async function Dues({
  params,
  canWrite,
  remindersReady,
}: {
  params: Record<string, string | undefined>;
  canWrite: boolean;
  remindersReady: boolean;
}) {
  const dues = await listDues({
    days: params.days ?? '14',
    method: params.method,
    page: params.page ?? '1',
    pageSize: '50',
  });
  const base = { ...params, tab: undefined, days: params.days ?? '14' };
  return (
    <>
      <div className="mb-3 grid gap-2">
        <FilterChips
          basePath="/admin/installments"
          params={base}
          name="days"
          label="سررسید تا"
          allLabel={null}
          options={[
            { value: '7', label: '۷ روز' },
            { value: '14', label: '۱۴ روز' },
            { value: '30', label: '۳۰ روز' },
            { value: '90', label: '۹۰ روز' },
            { value: '366', label: 'یک سال' },
          ]}
        />
        <FilterChips
          basePath="/admin/installments"
          params={base}
          name="method"
          label="روش"
          options={CREDIT_METHODS.map((method) => ({ value: method, label: CREDIT_METHOD_LABELS[method] }))}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>قرارداد</Th>
            <Th>مشتری</Th>
            <Th>قسط</Th>
            <Th>سررسید</Th>
            <Th>مانده</Th>
            <Th>چک</Th>
            {canWrite ? <Th className="w-40" /> : null}
          </tr>
        </thead>
        <tbody>
          {dues.items.length === 0 ? (
            <EmptyRow colSpan={canWrite ? 7 : 6} label="قسط بازی در این بازه نیست" />
          ) : (
            dues.items.map((row) => (
              <tr
                key={row.installmentId}
                className={cn(
                  'transition-colors hover:bg-surface-2',
                  row.daysLate > 0 && 'bg-danger-soft/30',
                )}
              >
                <Td>
                  <Link href={`/admin/installments/${row.contractId}`} className="text-ink hover:underline">
                    {formatNumberFa(row.contractNumber)}
                  </Link>
                  <span className="block text-[11px] text-muted">{CREDIT_METHOD_LABELS[row.method]}</span>
                </Td>
                <Td>
                  <span className="block text-ink">{row.customerName}</span>
                  <a
                    href={`tel:${row.customerPhone}`}
                    className="block font-display text-[11px] text-muted hover:text-ink"
                  >
                    {row.customerPhone}
                  </a>
                </Td>
                <Td className="text-[12px]">
                  {formatNumberFa(row.index)} از {formatNumberFa(row.months)}
                </Td>
                <Td className="text-[12px]">
                  {formatJalali(row.dueDate)}
                  <span
                    className={cn(
                      'block text-[11px]',
                      row.daysLate > 0 ? 'font-medium text-danger' : 'text-muted',
                    )}
                  >
                    {dueLabel(row.daysLate, formatNumberFa)}
                  </span>
                </Td>
                <Td className="whitespace-nowrap tabular">
                  {formatToman(row.remaining)}
                  {row.remaining !== row.amount ? (
                    <span className="block text-[11px] text-muted">از {formatToman(row.amount)}</span>
                  ) : null}
                </Td>
                <Td className="text-[12px]">
                  {row.cheque ? (
                    <>
                      {row.cheque.bankName}
                      <Badge tone={CHEQUE_TONE[row.cheque.status]} className="ms-1">
                        {row.cheque.statusLabel}
                      </Badge>
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                {canWrite ? (
                  <Td>
                    <div className="flex items-center justify-end gap-1">
                      <RemindButton
                        installmentId={row.installmentId}
                        ready={remindersReady}
                        remindedAt={row.remindedAt}
                      />
                      <RecordPaymentDialog
                        contractId={row.contractId}
                        installment={{ id: row.installmentId, index: row.index, remaining: row.remaining }}
                      />
                    </div>
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <TablePagination
        page={dues.page}
        totalPages={dues.totalPages}
        total={dues.total}
        basePath="/admin/installments"
        params={params}
      />
    </>
  );
}

async function Cheques({
  params,
  canWrite,
}: {
  params: Record<string, string | undefined>;
  canWrite: boolean;
}) {
  const cheques = await listCheques({
    q: params.q,
    status: params.status,
    dueWithin: params.dueWithin,
    page: params.page ?? '1',
    pageSize: '30',
  });
  return (
    <>
      <div className="mb-3 grid gap-2">
        <AdminSearch placeholder="شناسهٔ صیادی، بانک، صادرکننده یا مشتری…" />
        <FilterChips
          basePath="/admin/installments"
          params={params}
          name="status"
          label="وضعیت"
          options={CHEQUE_STATUSES.map((status) => ({ value: status, label: CHEQUE_STATUS_LABELS[status] }))}
        />
        <FilterChips
          basePath="/admin/installments"
          params={params}
          name="dueWithin"
          label="سررسید تا"
          options={[
            { value: '7', label: '۷ روز' },
            { value: '30', label: '۳۰ روز' },
          ]}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>قرارداد</Th>
            <Th>مشتری</Th>
            <Th>چک</Th>
            <Th>مبلغ</Th>
            <Th>سررسید</Th>
            <Th>وضعیت</Th>
            {canWrite ? <Th className="w-28" /> : null}
          </tr>
        </thead>
        <tbody>
          {cheques.items.length === 0 ? (
            <EmptyRow colSpan={canWrite ? 7 : 6} label="چکی پیدا نشد" />
          ) : (
            cheques.items.map((cheque) => (
              <tr key={cheque.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link
                    href={`/admin/installments/${cheque.contractId}`}
                    className="text-ink hover:underline"
                  >
                    {formatNumberFa(cheque.contractNumber)}
                  </Link>
                  <span className="block text-[11px] text-muted">
                    {cheque.installmentIndex ? `قسط ${formatNumberFa(cheque.installmentIndex)}` : 'ضمانت'}
                  </span>
                </Td>
                <Td>
                  <span className="block text-ink">{cheque.customerName}</span>
                  <span className="block font-display text-[11px] text-muted">{cheque.customerPhone}</span>
                </Td>
                <Td className="text-[12px]">
                  {cheque.bankName}
                  <span className="block font-display text-[11px] text-muted" dir="ltr">
                    {cheque.sayadId}
                  </span>
                  {!cheque.sayadConfirmed ? (
                    <span className="block text-[11px] text-warning">در صیاد تأیید نشده</span>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap tabular">{formatToman(cheque.amount)}</Td>
                <Td className="text-[12px]">
                  {formatJalali(cheque.dueDate)}
                  {cheque.daysLate > 0 ? (
                    <span className="block text-[11px] text-danger">
                      {formatNumberFa(cheque.daysLate)} روز گذشته
                    </span>
                  ) : null}
                </Td>
                <Td>
                  <Badge tone={CHEQUE_TONE[cheque.status]}>{cheque.statusLabel}</Badge>
                </Td>
                {canWrite ? (
                  <Td>
                    <ChequeActionDialog cheque={cheque} />
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <TablePagination
        page={cheques.page}
        totalPages={cheques.totalPages}
        total={cheques.total}
        basePath="/admin/installments"
        params={params}
      />
    </>
  );
}

async function Contracts({ params }: { params: Record<string, string | undefined> }) {
  const contracts = await listContracts({
    q: params.q,
    status: params.status,
    method: params.method,
    overdue: params.overdue,
    page: params.page ?? '1',
    pageSize: '20',
  });
  return (
    <>
      <div className="mb-3 grid gap-2">
        <AdminSearch placeholder="شماره قرارداد، نام، موبایل، کد ملی یا شناسهٔ صیادی…" />
        <FilterChips
          basePath="/admin/installments"
          params={params}
          name="status"
          label="وضعیت"
          options={CONTRACT_STATUSES.map((status) => ({
            value: status,
            label: CONTRACT_STATUS_LABELS[status],
          }))}
        />
        <FilterChips
          basePath="/admin/installments"
          params={params}
          name="overdue"
          allLabel="همه"
          options={[{ value: 'true', label: 'فقط معوق‌دارها' }]}
        />
      </div>
      <Table>
        <thead>
          <tr>
            <Th>شماره</Th>
            <Th>مشتری</Th>
            <Th>کالا</Th>
            <Th>کل / مانده</Th>
            <Th>قسط بعدی</Th>
            <Th>وضعیت</Th>
          </tr>
        </thead>
        <tbody>
          {contracts.items.length === 0 ? (
            <EmptyRow colSpan={6} label="قراردادی پیدا نشد" />
          ) : (
            contracts.items.map((contract) => (
              <tr key={contract.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link
                    href={`/admin/installments/${contract.id}`}
                    className="font-medium text-ink hover:underline"
                  >
                    {formatNumberFa(contract.number)}
                  </Link>
                  <span className="block text-[11px] text-muted">{contract.methodLabel}</span>
                </Td>
                <Td>
                  <span className="block text-ink">{contract.customerName}</span>
                  <span className="block font-display text-[11px] text-muted">{contract.customerPhone}</span>
                </Td>
                <Td className="max-w-56 text-[12px]">{contract.itemDescription}</Td>
                <Td className="whitespace-nowrap text-[12px] tabular">
                  {formatToman(contract.totalPayable)}
                  <span className="block text-[11px] text-muted">
                    مانده {formatToman(contract.remaining)}
                  </span>
                  {contract.overdueCount ? (
                    <span className="block text-[11px] text-danger">
                      معوق {formatToman(contract.overdueAmount)}
                    </span>
                  ) : null}
                </Td>
                <Td className="text-[12px]">
                  {contract.nextDue ? (
                    <>
                      {formatJalali(contract.nextDue.dueDate)}
                      <span className="block text-[11px] text-muted tabular">
                        {formatToman(contract.nextDue.amount)}
                      </span>
                    </>
                  ) : (
                    '—'
                  )}
                </Td>
                <Td>
                  <Badge tone={CONTRACT_TONE[contract.status]}>{contract.statusLabel}</Badge>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>
      <TablePagination
        page={contracts.page}
        totalPages={contracts.totalPages}
        total={contracts.total}
        basePath="/admin/installments"
        params={params}
      />
    </>
  );
}
