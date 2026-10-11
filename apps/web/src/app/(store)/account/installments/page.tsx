import type { Metadata } from 'next';
import Link from 'next/link';
import { BookOpenCheck } from 'lucide-react';
import { getMyInstallments } from '@/lib/api/endpoints';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { BookletCard } from '@/components/store/installment-booklet';

export const metadata: Metadata = { title: 'دفترچهٔ اقساط', robots: { index: false, follow: false } };

export default async function MyInstallmentsPage() {
  const contracts = await getMyInstallments();

  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={BookOpenCheck}
        title="هنوز دفترچهٔ اقساطی نداری"
        description="وقتی با چک یا سفته قسطی بخری، دفترچهٔ اقساطت با همهٔ سررسیدها اینجا ساخته می‌شود."
        action={
          <Button asChild size="sm">
            <Link href="/installments">خرید قسطی آیفون</Link>
          </Button>
        }
        className="border-dashed"
      />
    );
  }

  return (
    <div className="grid gap-3">
      <h2 className="text-[15px] font-semibold text-ink">دفترچهٔ اقساط</h2>
      {contracts.map((contract) => (
        <BookletCard key={contract.number} contract={contract} />
      ))}
    </div>
  );
}
