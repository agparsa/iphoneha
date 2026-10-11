import type { Metadata } from 'next';
import { Breadcrumbs } from '@/components/store/breadcrumbs';
import { WishlistView } from '@/components/store/wishlist-view';

export const metadata: Metadata = {
  title: 'علاقه‌مندی‌ها',
  description: 'آیفون‌هایی که برای خرید بعدی ذخیره کرده‌ای.',
  robots: { index: false, follow: true },
};

export default function WishlistPage() {
  return (
    <div className="container-page py-5 md:py-8">
      <Breadcrumbs
        items={[
          { name: 'خانه', href: '/' },
          { name: 'علاقه‌مندی‌ها', href: '/wishlist' },
        ]}
      />
      <header className="mb-6">
        <p className="eyebrow">Saved</p>
        <h1 className="mt-2 text-2xl font-semibold text-ink sm:text-3xl">علاقه‌مندی‌ها</h1>
        <p className="mt-2 text-[13px] text-muted">
          این فهرست فقط در همین مرورگر ذخیره می‌شود؛ برای خرید کافی است رنگ و حافظه را انتخاب کنی.
        </p>
      </header>
      <WishlistView />
    </div>
  );
}
