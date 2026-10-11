import type { Metadata } from 'next';
import { getSessions } from '@/lib/api/endpoints';
import { SessionList } from '@/components/store/session-list';

export const metadata: Metadata = { title: 'دستگاه‌های فعال', robots: { index: false, follow: false } };

export default async function SessionsPage() {
  const sessions = await getSessions();
  return <SessionList initialSessions={sessions} />;
}
