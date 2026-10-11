import type { Metadata } from 'next';
import { CheckoutFlow } from '@/components/store/checkout-flow';

export const metadata: Metadata = {
  title: 'تکمیل خرید',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return (
    <div className="container-page py-5 md:py-8">
      <h1 className="mb-6 text-2xl font-semibold text-ink">تکمیل خرید</h1>
      <CheckoutFlow />
    </div>
  );
}
