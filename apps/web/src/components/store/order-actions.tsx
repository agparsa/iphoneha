'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CreditCard, Timer, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { formatToman, type OrderDto } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useDeadline } from '@/hooks/use-countdown';
import { formatCountdown } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';

/** Pay / cancel actions plus the reservation countdown on an order. */
export function OrderActions({ order }: { order: OrderDto }) {
  const router = useRouter();
  const [pending, setPending] = useState<'pay' | 'cancel' | null>(null);
  const remaining = useDeadline(order.canPay ? order.reservationExpiresAt : null);

  async function pay() {
    setPending('pay');
    try {
      const response = await api.post<{ redirectUrl: string | null }>('/payments/create', {
        orderId: order.id,
      });
      if (response.redirectUrl) window.location.assign(response.redirectUrl);
      else toast.error('درگاه پرداخت در دسترس نیست. کمی بعد دوباره تلاش کن.');
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  async function cancel() {
    setPending('cancel');
    try {
      await api.post(`/orders/${order.id}/cancel`);
      toast.success('سفارش لغو شد');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(null);
    }
  }

  if (!order.canPay && !order.canCancel) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
      {order.canPay ? (
        <>
          <Button size="md" loading={pending === 'pay'} onClick={pay}>
            <CreditCard className="size-4" aria-hidden />
            پرداخت {formatToman(order.total)}
          </Button>
          {remaining > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-pill bg-warning-soft px-3 py-1.5 text-[11px] text-warning">
              <Timer className="size-3.5" aria-hidden />
              مهلت پرداخت: <span className="tabular">{formatCountdown(remaining)}</span>
            </span>
          ) : null}
        </>
      ) : null}

      {order.canCancel ? (
        <Dialog>
          <DialogTrigger asChild>
            <Button size="md" variant="ghost" className="text-danger hover:bg-danger-soft">
              <XCircle className="size-4" aria-hidden />
              لغو سفارش
            </Button>
          </DialogTrigger>
          <DialogContent title="لغو سفارش" description="با لغو سفارش، موجودی رزروشده آزاد می‌شود. مطمئنی؟">
            <div className="flex gap-2">
              <Button variant="danger" size="md" loading={pending === 'cancel'} onClick={cancel}>
                بله، لغو کن
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}
