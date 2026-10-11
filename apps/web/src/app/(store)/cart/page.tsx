import type { Metadata } from 'next';
import { getStorefrontHome } from '@/lib/api/endpoints';
import { CartView } from '@/components/store/cart-view';

export const metadata: Metadata = {
  title: 'سبد خرید',
  robots: { index: false, follow: false },
};

export const revalidate = 60;

export default async function CartPage() {
  // shown only when the cart is empty, so an empty basket still offers a way on
  const home = await getStorefrontHome().catch(() => null);

  return (
    <div className="container-page py-5 md:py-8">
      <h1 className="mb-6 text-2xl font-semibold text-ink">سبد خرید</h1>
      <CartView suggestions={home?.featured.slice(0, 4) ?? []} />
    </div>
  );
}
