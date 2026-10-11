import { listAuditLogs } from '@/lib/api/admin';
import { formatDateTimeFa } from '@/lib/utils';
import { EmptyRow, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';

type SearchParams = Promise<{ entityType?: string; page?: string }>;

export default async function AdminAuditLogsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const logs = await listAuditLogs({
    entityType: params.entityType,
    page: params.page ?? '1',
    pageSize: '30',
  });

  return (
    <div>
      <PageHeader title="گزارش فعالیت" description="هر تغییر مدیران با مقدار قبل و بعد ثبت می‌شود" />

      <Table>
        <thead>
          <tr>
            <Th>زمان</Th>
            <Th>مدیر</Th>
            <Th>اقدام</Th>
            <Th>موجودیت</Th>
            <Th>IP</Th>
          </tr>
        </thead>
        <tbody>
          {logs.items.length === 0 ? (
            <EmptyRow colSpan={5} label="فعالیتی ثبت نشده است" />
          ) : (
            logs.items.map((log) => (
              <tr key={log.id}>
                <Td className="text-[12px]">{formatDateTimeFa(log.createdAt)}</Td>
                <Td>
                  <span className="block text-ink">{log.admin?.name ?? 'سیستم'}</span>
                  {log.admin ? (
                    <span className="block text-[11px] text-muted font-display">{log.admin.phone}</span>
                  ) : null}
                </Td>
                <Td className="whitespace-nowrap font-display text-[12px]">{log.action}</Td>
                <Td className="text-[12px]">
                  {log.entityType}
                  {log.entityId ? (
                    <span className="block text-[11px] text-muted-faint font-display">{log.entityId}</span>
                  ) : null}
                </Td>
                <Td className="font-display text-[11px]">{log.ip ?? '—'}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={logs.page}
        totalPages={logs.totalPages}
        total={logs.total}
        basePath="/admin/audit-logs"
        params={params}
      />
    </div>
  );
}
