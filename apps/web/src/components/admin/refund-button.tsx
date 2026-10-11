'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { formatToman } from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export function RefundButton({ paymentId, amount }: { paymentId: string; amount: number }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);

  async function refund() {
    if (reason.trim().length < 2) {
      toast.error('دلیل بازگشت وجه را بنویس');
      return;
    }
    setPending(true);
    try {
      await api.post(`/admin/payments/${paymentId}/refund`, { reason: reason.trim() });
      toast.success('درخواست بازگشت وجه ثبت شد');
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button size="sm" variant="ghost" className="mt-2 text-danger hover:bg-danger-soft">
          بازگشت وجه
        </Button>
      </DialogTrigger>
      <DialogContent
        title="بازگشت وجه"
        description={`مبلغ ${formatToman(amount)} به مشتری بازگردانده می‌شود.`}
      >
        <Field label="دلیل بازگشت" htmlFor="refund-reason" hint="این متن در گزارش فعالیت ثبت می‌شود.">
          <Input id="refund-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
        </Field>
        <Button variant="danger" size="md" className="mt-4" loading={pending} onClick={refund}>
          تأیید بازگشت وجه
        </Button>
      </DialogContent>
    </Dialog>
  );
}
