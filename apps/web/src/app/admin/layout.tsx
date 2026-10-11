import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: { default: 'پنل مدیریت آیفونی‌ها', template: '%s | پنل مدیریت' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children;
}
