'use client';

import { useState, useSyncExternalStore } from 'react';
import Link from 'next/link';
import { CheckCircle2, Send } from 'lucide-react';
import {
  CREDIT_METHOD_LABELS,
  formatNumberFa,
  type CreditMethod,
  type CreditRequestCreatedDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { trackLead } from '@/lib/analytics';
import { telHref } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreditSelection } from './credit-selection';

const ANY_MODEL = 'any';
const VISIBLE_FIELDS = new Set(['name', 'phone', 'method', 'city', 'note']);

/**
 * Plans a banner can open this form for (`?plan=…` in the address): the note
 * starts with the plan written in, so the request says what it is about.
 */
const PLAN_NOTES: Record<string, { note: string; hint: string }> = {
  'trade-in': {
    note: 'طرح تعویض آیفون قدیمی با جدید — مدل، حافظه و وضعیت آیفون فعلی‌ام: ',
    hint: 'طرح تعویض: مدل و وضعیت آیفون فعلی‌ات را بنویس؛ کارشناس ما برای ارزیابی و گفتن شرایط تماس می‌گیرد.',
  },
};
const noSubscribe = () => () => {};
const readSearch = () => window.location.search;
const noSearch = () => '';

export interface RequestFormModel {
  slug: string;
  name: string;
  price: number;
}

/**
 * «درخواست خرید قسطی با چک یا سفته». Name, mobile and (optionally) city,
 * model and a note; the store calls back. A hidden field catches form bots.
 */
export function CreditRequestForm({
  models,
  methods,
  defaultMethod,
  source,
  approvalTime,
  phone,
}: {
  models: RequestFormModel[];
  methods: CreditMethod[];
  defaultMethod: CreditMethod;
  /** the page path, recorded with the request */
  source: string;
  approvalTime: string;
  phone: string;
}) {
  const shared = useCreditSelection();
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [city, setCity] = useState('');
  // read in the browser only: the page stays one static page for every visitor
  const search = useSyncExternalStore(noSubscribe, readSearch, noSearch);
  const plan = PLAN_NOTES[new URLSearchParams(search).get('plan') ?? ''];
  // null until the visitor types: until then the plan's note stands in
  const [typedNote, setNote] = useState<string | null>(null);
  const note = typedNote ?? plan?.note ?? '';
  const [website, setWebsite] = useState('');
  const [localMethod, setLocalMethod] = useState<CreditMethod>(defaultMethod);
  const [localModel, setLocalModel] = useState<string>(ANY_MODEL);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState<CreditRequestCreatedDto | null>(null);

  // the calculator on the same page can pick the method, model and months
  const method =
    shared?.selection.method && methods.includes(shared.selection.method)
      ? shared.selection.method
      : localMethod;
  const modelSlug = shared?.selection.modelSlug ?? localModel;
  const months = shared?.selection.months ?? null;
  const model = models.find((item) => item.slug === modelSlug) ?? null;

  async function submit() {
    setErrors({});
    setPending(true);
    try {
      const result = await api.post<CreditRequestCreatedDto>('/credit-requests', {
        name,
        phone: mobile,
        city: city || null,
        method,
        productSlug: model?.slug ?? null,
        months: model ? months : null,
        note: note || null,
        source,
        website,
      });
      setDone(result);
      if (!result.duplicate) trackLead(method, model);
    } catch (cause) {
      const fields = cause instanceof ApiError ? cause.fieldErrors : {};
      // a problem with a field the visitor cannot see (model, months, page) still needs a message
      const hidden = Object.keys(fields).some((key) => !VISIBLE_FIELDS.has(key));
      setErrors(Object.keys(fields).length > 0 && !hidden ? fields : { ...fields, _: errorMessage(cause) });
    } finally {
      setPending(false);
    }
  }

  if (done) {
    return (
      <div
        className="grid justify-items-center gap-3 rounded-panel border border-line bg-surface-2 p-8 text-center"
        role="status"
      >
        <CheckCircle2 className="size-10 text-success" aria-hidden />
        <p className="text-[17px] font-semibold text-ink">
          {done.duplicate ? 'درخواستت قبلاً ثبت شده است' : 'درخواستت ثبت شد'}
        </p>
        {done.number ? (
          <p className="text-[13px] text-muted">
            شمارهٔ پیگیری:{' '}
            <span className="font-display font-semibold text-ink tabular">{formatNumberFa(done.number)}</span>
          </p>
        ) : null}
        <p className="max-w-md text-[13px] leading-7 text-muted">
          کارشناس ما {approvalTime ? `ظرف ${approvalTime}` : 'به‌زودی'} با شماره‌ات تماس می‌گیرد و شرایط دقیق،
          پیش‌پرداخت و مبلغ اقساط را می‌گوید. اگر عجله داری با{' '}
          <a href={telHref(phone)} className="font-medium text-ink underline underline-offset-4">
            {phone}
          </a>{' '}
          تماس بگیر.
        </p>
      </div>
    );
  }

  return (
    <form
      className="grid gap-4 rounded-panel border border-line p-5 sm:p-6"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="نام و نام خانوادگی" htmlFor="credit-name" error={errors.name}>
          <Input
            id="credit-name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            aria-invalid={Boolean(errors.name)}
            required
          />
        </Field>
        <Field label="شماره موبایل" htmlFor="credit-phone" error={errors.phone}>
          <Input
            id="credit-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            className="font-display"
            placeholder="09xx xxx xxxx"
            value={mobile}
            onChange={(event) => setMobile(event.target.value)}
            aria-invalid={Boolean(errors.phone)}
            required
          />
        </Field>
      </div>

      {methods.length > 1 ? (
        <fieldset>
          <legend className="mb-2 text-[13px] font-medium text-ink-muted">روش خرید قسطی</legend>
          <RadioGroup
            value={method}
            onValueChange={(value) => {
              setLocalMethod(value as CreditMethod);
              shared?.update({ method: value as CreditMethod });
            }}
            className="grid gap-2 sm:grid-cols-2"
          >
            {methods.map((item) => (
              <RadioCard key={item} value={item} id={`credit-method-${item}`} className="py-3">
                <span className="text-[13px] font-medium text-ink">{CREDIT_METHOD_LABELS[item]}</span>
              </RadioCard>
            ))}
          </RadioGroup>
          {errors.method ? <p className="mt-1.5 text-xs text-danger">{errors.method}</p> : null}
        </fieldset>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <p id="credit-model-label" className="mb-2 text-[13px] font-medium text-ink-muted">
            مدل آیفون
          </p>
          <Select
            value={model?.slug ?? ANY_MODEL}
            onValueChange={(value) => {
              // Radix echoes an empty value from its hidden native <select> when
              // the value changes before that option exists (a model picked from
              // the address during hydration) — it is not a choice, so skip it
              if (value !== ANY_MODEL && !models.some((item) => item.slug === value)) return;
              const slug = value === ANY_MODEL ? null : value;
              setLocalModel(value);
              shared?.update({ modelSlug: slug });
            }}
          >
            <SelectTrigger aria-labelledby="credit-model-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ANY_MODEL}>هنوز انتخاب نکرده‌ام</SelectItem>
              {models.map((item) => (
                <SelectItem key={item.slug} value={item.slug}>
                  {item.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {model && months ? (
            <p className="mt-1.5 text-[11px] text-muted">
              با {formatNumberFa(months)} قسط، طبق محاسبه‌گر همین صفحه
            </p>
          ) : null}
        </div>
        <Field label="شهر (اختیاری)" htmlFor="credit-city" error={errors.city}>
          <Input
            id="credit-city"
            autoComplete="address-level2"
            value={city}
            onChange={(event) => setCity(event.target.value)}
          />
        </Field>
      </div>

      <Field label="توضیح (اختیاری)" htmlFor="credit-note" error={errors.note} hint={plan?.hint}>
        <Textarea
          id="credit-note"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثلاً رنگ و حافظهٔ دلخواه یا بهترین زمان تماس"
        />
      </Field>

      {/* for bots only: people never see or reach this field */}
      <div aria-hidden className="sr-only">
        <label htmlFor="credit-website">وب‌سایت</label>
        <input
          id="credit-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(event) => setWebsite(event.target.value)}
        />
      </div>

      {errors._ ? (
        <p className="rounded-xl bg-danger-soft px-3 py-2.5 text-[12px] text-danger" role="alert">
          {errors._}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="submit"
          size="lg"
          loading={pending}
          className="shine relative h-auto min-h-13 whitespace-normal py-3 text-center leading-6"
        >
          <Send className="size-4" aria-hidden />
          ثبت درخواست خرید با {CREDIT_METHOD_LABELS[method]}
        </Button>
        <p className="text-[11px] leading-5 text-muted">
          شماره‌ات فقط برای تماس دربارهٔ همین خرید استفاده می‌شود؛{' '}
          <Link href="/privacy" className="underline underline-offset-4 hover:text-ink">
            حریم خصوصی
          </Link>
        </p>
      </div>
    </form>
  );
}
