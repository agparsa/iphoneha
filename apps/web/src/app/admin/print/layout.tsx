import { redirect } from 'next/navigation';
import { getAdminMe } from '@/lib/api/admin';

/** Printable pages of the panel (invoice, shipping label, contract): no menu, only for signed-in staff. */
export default async function PrintLayout({ children }: { children: React.ReactNode }) {
  const admin = await getAdminMe();
  if (!admin) redirect('/admin/login');
  return <div className="min-h-dvh bg-surface-2 py-6 text-ink print:bg-white print:py-0">{children}</div>;
}
