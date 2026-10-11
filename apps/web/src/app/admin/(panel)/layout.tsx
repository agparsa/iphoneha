import { redirect } from 'next/navigation';
import { getAdminMe, getCreditRequestSummary } from '@/lib/api/admin';
import { AdminShell } from '@/components/admin/shell';

export default async function AdminPanelLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminMe();
  if (!admin) redirect('/admin/login');
  // requests waiting for a call show as a count next to their menu entry; the open panel keeps it current
  const creditRequests = admin.permissions.includes('leads.read') ? await getCreditRequestSummary() : null;
  return (
    <AdminShell admin={admin} creditRequests={creditRequests}>
      {children}
    </AdminShell>
  );
}
