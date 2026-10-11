import { redirect } from 'next/navigation';
import { getMe } from '@/lib/api/endpoints';

/** The customer's printable pages (the instalment booklet): no menu, only for the signed-in customer. */
export default async function CustomerPrintLayout({ children }: { children: React.ReactNode }) {
  const user = await getMe();
  if (!user) redirect('/login?next=/account/installments');
  return <div className="min-h-dvh bg-surface-2 py-6 text-ink print:bg-white print:py-0">{children}</div>;
}
