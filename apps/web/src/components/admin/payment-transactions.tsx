'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Receipt } from 'lucide-react';
import {
  paymentMethodName,
  formatToman,
  type OrderPaymentMethod,
  type PaymentTransactionDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { formatDateTimeFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

/** Raw gateway traffic for one payment — what was sent, what came back, and when. */
export function PaymentTransactions({
  paymentId,
  orderNumber,
  method,
  amount,
}: {
  paymentId: string;
  orderNumber: string;
  method: OrderPaymentMethod;
  amount: number;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['payment-transactions', paymentId],
    queryFn: () => api.get<PaymentTransactionDto[]>(`/admin/payments/${paymentId}/transactions`),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon-sm" variant="ghost" aria-label={`تراکنش‌های ${orderNumber}`}>
          <Receipt />
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`تراکنش‌های ${orderNumber}`}
        description={`${paymentMethodName(method)} — ${formatToman(amount)}`}
        className="max-h-[85dvh] max-w-xl overflow-y-auto"
      >
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="size-5 animate-spin text-muted" aria-hidden />
          </div>
        ) : error ? (
          <p className="py-6 text-center text-[13px] text-danger">{errorMessage(error)}</p>
        ) : !data || data.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-muted">تراکنشی ثبت نشده است.</p>
        ) : (
          <ul className="grid gap-3">
            {data.map((transaction) => (
              <li key={transaction.id} className="rounded-2xl border border-line p-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-display text-[13px] text-ink">{transaction.type}</span>
                  <Badge tone={transaction.success ? 'success' : 'danger'}>
                    {transaction.success ? 'موفق' : 'ناموفق'}
                  </Badge>
                </div>
                <p className="mt-1 text-[11px] text-muted">{formatDateTimeFa(transaction.createdAt)}</p>
                {transaction.errorMessage ? (
                  <p className="mt-2 text-[12px] text-danger">{transaction.errorMessage}</p>
                ) : null}

                <details className="mt-3">
                  <summary className="cursor-pointer text-[12px] text-muted hover:text-ink">
                    جزئیات فنی
                  </summary>
                  <div className="mt-2 grid gap-2">
                    <Payload label="درخواست" value={transaction.requestPayload} />
                    <Payload label="پاسخ" value={transaction.responsePayload} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Payload({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div>
      <p className="mb-1 text-[11px] text-muted">{label}</p>
      <pre
        dir="ltr"
        className="max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 text-[11px] leading-5 text-ink-muted font-display"
      >
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
