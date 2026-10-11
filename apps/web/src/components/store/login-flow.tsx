'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  formatNumberFa,
  normalizePhone,
  toLatinDigits,
  toPersianDigits,
  type SendOtpResponse,
  type UserDto,
  type VerifyOtpResponse,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { useCart } from '@/providers/cart-provider';
import { useSession } from '@/providers/session-provider';
import { useCountdown } from '@/hooks/use-countdown';
import { cn, formatCountdown, safeInternalPath } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { BrandMark } from '@/components/brand/brand';

type Step = 'phone' | 'otp' | 'profile';

export function LoginFlow({ onSuccess, compact }: { onSuccess?: () => void; compact?: boolean } = {}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = safeInternalPath(searchParams.get('next'));
  const { setUser, refresh } = useSession();
  const { refresh: refreshCart } = useCart();

  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [otpMeta, setOtpMeta] = useState<SendOtpResponse | null>(null);
  const otpRef = useRef<HTMLInputElement>(null);

  const resendIn = useCountdown(otpMeta?.resendIn ?? 0);
  const expiresIn = useCountdown(otpMeta?.expiresIn ?? 0);

  useEffect(() => {
    if (step === 'otp') otpRef.current?.focus();
  }, [step]);

  async function sendOtp(target = phone) {
    setError(undefined);
    const normalized = normalizePhone(toLatinDigits(target));
    if (!normalized) {
      setError('شماره موبایل معتبر نیست (مثال: ۰۹۱۲۳۴۵۶۷۸۹)');
      return;
    }
    setPending(true);
    try {
      const response = await api.post<SendOtpResponse>('/auth/send-otp', { phone: normalized });
      setPhone(normalized);
      setOtpMeta(response);
      setStep('otp');
      setCode('');
      toast.success('کد تأیید ارسال شد');
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  async function verify(value = code) {
    setError(undefined);
    const digits = toLatinDigits(value).replace(/\D/g, '');
    if (digits.length < (otpMeta?.codeLength ?? 6)) {
      setError('کد تأیید را کامل وارد کنید');
      return;
    }
    setPending(true);
    try {
      const response = await api.post<VerifyOtpResponse>('/auth/verify-otp', { phone, code: digits });
      setUser(response.user);
      await refreshCart();
      if (response.needsProfile) {
        setStep('profile');
      } else {
        toast.success('خوش آمدی!');
        if (onSuccess) onSuccess();
        else {
          router.replace(next);
          router.refresh();
        }
      }
    } catch (cause) {
      setError(errorMessage(cause));
      setCode('');
    } finally {
      setPending(false);
    }
  }

  async function saveProfile() {
    setError(undefined);
    setPending(true);
    try {
      const user = await api.patch<UserDto>('/users/me', { firstName, lastName });
      setUser(user);
      await refresh();
      toast.success('حساب شما تکمیل شد');
      if (onSuccess) onSuccess();
      else {
        router.replace(next);
        router.refresh();
      }
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <div className={compact ? 'mb-6 text-center' : 'mb-8 text-center'}>
        {compact ? null : <BrandMark className="mx-auto size-12" />}
        <h1 className="mt-4 text-xl font-semibold text-ink">
          {step === 'phone' ? 'ورود یا ثبت‌نام' : step === 'otp' ? 'کد تأیید' : 'تکمیل حساب'}
        </h1>
        <p className="mt-2 text-[13px] leading-6 text-muted">
          {step === 'phone'
            ? 'با شماره موبایل وارد شو؛ بدون رمز عبور، فقط یک کد تأیید.'
            : step === 'otp'
              ? `کد ${formatNumberFa(otpMeta?.codeLength ?? 6)} رقمی به ${toPersianDigits(phone)} ارسال شد.`
              : 'نام و نام خانوادگی برای صدور فاکتور و ارسال سفارش لازم است.'}
        </p>
      </div>

      {step === 'phone' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void sendOtp();
          }}
          className="grid gap-4"
        >
          <Field label="شماره موبایل" error={error} htmlFor="phone">
            <Input
              id="phone"
              name="phone"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              dir="ltr"
              placeholder="0912 345 6789"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              aria-invalid={Boolean(error)}
              className="text-center font-display tracking-[0.2em]"
            />
          </Field>
          <Button type="submit" size="lg" block loading={pending}>
            ارسال کد تأیید
          </Button>
          <p className="text-center text-[11px] leading-5 text-muted-faint">
            با ورود،{' '}
            <Link href="/guide#terms" className="text-muted underline underline-offset-2">
              قوانین و حریم خصوصی
            </Link>{' '}
            آیفونی‌ها را می‌پذیری.
          </p>
        </form>
      ) : null}

      {step === 'otp' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void verify();
          }}
          className="grid gap-4"
        >
          <Field label="کد تأیید" error={error} htmlFor="code">
            <Input
              id="code"
              ref={otpRef}
              name="one-time-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              dir="ltr"
              maxLength={8}
              placeholder="------"
              value={code}
              onChange={(event) => {
                const value = event.target.value;
                setCode(value);
                const digits = toLatinDigits(value).replace(/\D/g, '');
                if (digits.length === (otpMeta?.codeLength ?? 6)) void verify(digits);
              }}
              aria-invalid={Boolean(error)}
              className="text-center text-xl font-display tracking-[0.5em]"
            />
          </Field>

          <div className="flex items-center justify-between text-[12px]">
            <span className="text-muted">
              {expiresIn > 0 ? (
                <>
                  اعتبار کد: <span className="tabular">{formatCountdown(expiresIn)}</span>
                </>
              ) : (
                'اعتبار کد تمام شد'
              )}
            </span>
            <button
              type="button"
              disabled={resendIn > 0 || pending}
              onClick={() => void sendOtp()}
              className="font-medium text-ink disabled:text-muted-faint"
            >
              {resendIn > 0 ? `ارسال دوباره تا ${formatCountdown(resendIn)}` : 'ارسال دوباره کد'}
            </button>
          </div>

          <Button type="submit" size="lg" block loading={pending}>
            تأیید و ورود
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            block
            onClick={() => {
              setStep('phone');
              setError(undefined);
            }}
          >
            <ArrowRight className="size-4" aria-hidden />
            تغییر شماره موبایل
          </Button>
        </form>
      ) : null}

      {step === 'profile' ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void saveProfile();
          }}
          className="grid gap-4"
        >
          <Field label="نام" htmlFor="firstName">
            <Input
              id="firstName"
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
            />
          </Field>
          <Field label="نام خانوادگی" error={error} htmlFor="lastName">
            <Input
              id="lastName"
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" block loading={pending}>
            ذخیره و ادامه
          </Button>
        </form>
      ) : null}

      <p
        className={cn(
          'flex items-center justify-center gap-1.5 text-[11px] text-muted-faint',
          compact ? 'mt-5' : 'mt-8',
        )}
      >
        <ShieldCheck className="size-3.5 text-success" aria-hidden />
        اطلاعات شما نزد آیفونی‌ها محفوظ است.
      </p>
    </div>
  );
}
