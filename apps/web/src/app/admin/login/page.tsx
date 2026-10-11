import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getAdminMe } from '@/lib/api/admin';
import { AdminLoginFlow } from '@/components/admin/login-flow';

export const metadata: Metadata = { title: 'ورود به پنل مدیریت' };

export default async function AdminLoginPage() {
  const admin = await getAdminMe();
  if (admin) redirect('/admin');

  return (
    <div className="flex min-h-dvh items-center justify-center bg-surface-2 px-4 py-12">
      <div className="w-full max-w-sm rounded-panel border border-line bg-canvas p-6">
        <AdminLoginFlow />
      </div>
    </div>
  );
}
