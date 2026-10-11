'use client';

import { useId, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  formatJalali,
  formatJalaliInput,
  formatToman,
  parseJalaliInput,
  tehranToday,
  toLatinDigits,
} from '@iphoneha/shared';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** «۱۲٬۵۰۰٬۰۰۰» typed as Persian or Latin digits, with or without separators → 12500000 (null when empty). */
export function parseAmount(text: string): number | null {
  const digits = toLatinDigits(text).replace(/[\s,٬_]/g, '');
  if (!digits) return null;
  if (!/^\d+$/.test(digits)) return Number.NaN;
  return Number(digits);
}

const group = (value: number) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * An amount in Toman: digits only, grouped by thousands as it is typed, with
 * the amount in words-and-digits under it so a missing zero is easy to spot.
 */
export function MoneyInput({
  value,
  onChange,
  id,
  placeholder,
  className,
  invalid,
  showHint = true,
  ...rest
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  showHint?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value === null ? '' : group(value));
  // a value set from outside (a schedule rebuilt, a form reset) replaces what is shown
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if (parseAmount(text) !== value) setText(value === null ? '' : group(value));
  }

  return (
    <div className={className}>
      <Input
        {...rest}
        id={id}
        inputMode="numeric"
        dir="ltr"
        autoComplete="off"
        className="font-display tabular"
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        value={text}
        onChange={(event) => {
          const parsed = parseAmount(event.target.value);
          if (parsed !== null && Number.isNaN(parsed)) return;
          setText(parsed === null ? '' : group(parsed));
          onChange(parsed);
        }}
      />
      {showHint && value ? <p className="mt-1 text-[11px] text-muted tabular">{formatToman(value)}</p> : null}
    </div>
  );
}

/**
 * A Jalali day typed the way the staff write it — «1405/07/10» or
 * «۱۴۰۵/۷/۱۰» — kept as an ISO date. The day is read back in words under
 * the field, and «امروز» fills today.
 */
export function JalaliDateInput({
  value,
  onChange,
  id,
  className,
  allowEmpty = false,
  todayButton = true,
  ...rest
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  className?: string;
  allowEmpty?: boolean;
  todayButton?: boolean;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  const [text, setText] = useState(value ? formatJalaliInput(value) : '');
  const hintId = useId();
  const [shown, setShown] = useState(value);
  if (value !== shown) {
    setShown(value);
    if ((value ?? null) !== parseJalaliInput(text)) setText(value ? formatJalaliInput(value) : '');
  }
  const parsed = text.trim() ? parseJalaliInput(text) : null;
  const invalid = Boolean(text.trim()) && !parsed;

  return (
    <div className={className}>
      <div className="relative">
        <Input
          {...rest}
          id={id}
          dir="ltr"
          inputMode="numeric"
          autoComplete="off"
          placeholder="1405/07/10"
          className={cn('font-display tabular', todayButton && 'pe-16')}
          aria-invalid={invalid || undefined}
          aria-describedby={hintId}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            const next = event.target.value.trim() ? parseJalaliInput(event.target.value) : null;
            if (next || (allowEmpty && !event.target.value.trim())) onChange(next);
          }}
        />
        {todayButton ? (
          <button
            type="button"
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded-pill bg-surface px-2.5 py-1 text-[11px] text-ink-muted hover:bg-surface-3"
            onClick={() => {
              const today = tehranToday();
              setText(formatJalaliInput(today));
              onChange(today);
            }}
          >
            امروز
          </button>
        ) : null}
      </div>
      <p id={hintId} className={cn('mt-1 text-[11px]', invalid ? 'text-danger' : 'text-muted')}>
        {invalid ? 'تاریخ شمسی معتبر نیست (مثل ۱۴۰۵/۰۷/۱۰)' : parsed ? formatJalali(parsed, 'long') : ' '}
      </p>
    </div>
  );
}

/** The first field problem of a rejected form, or the API's own message. */
export function formError(error: unknown): string {
  if (error instanceof ApiError) {
    const first = Object.values(error.fieldErrors)[0];
    if (first) return first;
  }
  return errorMessage(error);
}

/**
 * Runs a panel action: a spinner while it runs, a toast with the result,
 * and a refresh of the server-rendered page afterwards.
 */
export function useAction() {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  async function run<T>(key: string, action: () => Promise<T>, success?: string | ((result: T) => string)) {
    setPending(key);
    try {
      const result = await action();
      if (success) toast.success(typeof success === 'function' ? success(result) : success);
      router.refresh();
      return result;
    } catch (error) {
      toast.error(formError(error));
      return undefined;
    } finally {
      setPending(null);
    }
  }
  return { pending, run };
}
