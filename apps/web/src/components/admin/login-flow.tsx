'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatNumberFa,
  normalizePhone,
  toLatinDigits,
  toPersianDigits,
  type SendOtpResponse,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useCountdown } from '@/hooks/use-countdown';
import { formatCountdown } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BrandMark } from '@/components/brand/brand';

export function AdminLoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [meta, setMeta] = useState<SendOtpResponse | null>(null);
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const resendIn = useCountdown(meta?.resendIn ?? 0);

  async function sendOtp() {
    setError(undefined);
    const normalized = normalizePhone(toLatinDigits(phone));
    if (!normalized) {
      setError('شماره موبایل معتبر نیست');
      return;
    }
    setPending(true);
    try {
      const response = await api.post<SendOtpResponse>('/admin/auth/send-otp', { phone: normalized });
      setPhone(normalized);
      setMeta(response);
      setStep('otp');
      toast.success('کد تأیید ارسال شد');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function verify() {
    setError(undefined);
    setPending(true);
    try {
      await api.post('/admin/auth/verify-otp', { phone, code: toLatinDigits(code).replace(/\D/g, '') });
      toast.success('خوش آمدی');
      router.replace('/admin');
      router.refresh();
    } catch (cause) {
      setError(errorMessage(cause));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <div className="mb-6 text-center">
        <BrandMark className="mx-auto size-12" />
        <h1 className="mt-4 text-lg font-semibold text-ink">ورود به پنل مدیریت</h1>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          {step === 'phone'
            ? 'شماره موبایل مدیر را وارد کن؛ کد تأیید پیامک می‌شود.'
            : `کد ${formatNumberFa(meta?.codeLength ?? 6)} رقمی به ${toPersianDigits(phone)} ارسال شد.`}
        </p>
      </div>

      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void (step === 'phone' ? sendOtp() : verify());
        }}
      >
        {step === 'phone' ? (
          <Field label="شماره موبایل" error={error} htmlFor="admin-phone">
            <Input
              id="admin-phone"
              type="tel"
              inputMode="numeric"
              dir="ltr"
              autoComplete="username"
              placeholder="0912 000 0000"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className="text-center font-display tracking-[0.2em]"
            />
          </Field>
        ) : (
          <>
            <Field label="کد تأیید" error={error} htmlFor="admin-code">
              <Input
                id="admin-code"
                autoFocus
                inputMode="numeric"
                dir="ltr"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="text-center text-xl font-display tracking-[0.5em]"
              />
            </Field>
            <button
              type="button"
              disabled={resendIn > 0 || pending}
              onClick={() => void sendOtp()}
              className="text-[12px] font-medium text-ink disabled:text-muted-faint"
            >
              {resendIn > 0 ? `ارسال دوباره تا ${formatCountdown(resendIn)}` : 'ارسال دوباره کد'}
            </button>
          </>
        )}

        <Button type="submit" size="lg" block loading={pending}>
          {step === 'phone' ? 'ارسال کد تأیید' : 'ورود به پنل'}
        </Button>
      </form>

      <p className="mt-6 flex items-center justify-center gap-1.5 text-[11px] text-muted-faint">
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        نشست مدیریت پس از ۱۲ ساعت منقضی می‌شود.
      </p>
    </div>
  );
}
