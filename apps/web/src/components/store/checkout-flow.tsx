'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  CreditCard,
  Loader2,
  MapPin,
  Plus,
  ShoppingBag,
  Truck,
  User,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  formatNumberFa,
  formatToman,
  type AddressDto,
  type CheckoutQuoteDto,
  type CheckoutResponseDto,
  type PaymentMethod,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { errorMessage } from '@/lib/api/errors';
import { queryKeys } from '@/lib/api/keys';
import { trackBeginCheckout } from '@/lib/analytics';
import { useStoreConfig } from '@/providers/store-config-provider';
import { useCart } from '@/providers/cart-provider';
import { useSession } from '@/providers/session-provider';
import { offeredMethods } from '@/lib/credit';
import { cn, telHref } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { RadioCard, RadioGroup } from '@/components/ui/radio-group';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/input';
import { AddressForm } from './address-form';
import { CheckoutPayment, creditBreakdown, modeOf, type PaymentMode } from './checkout-payment';
import { LoginFlow } from './login-flow';
import { PaymentLogo } from './payment-logo';
import { ProductImage } from './product-image';

const STEPS = [
  { key: 'cart', label: 'سبد خرید', icon: ShoppingBag },
  { key: 'auth', label: 'ورود', icon: User },
  { key: 'address', label: 'آدرس', icon: MapPin },
  { key: 'shipping', label: 'ارسال', icon: Truck },
  { key: 'payment', label: 'پرداخت', icon: CreditCard },
  { key: 'review', label: 'بازبینی', icon: Check },
  { key: 'done', label: 'پرداخت نهایی', icon: Check },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

/** A fresh key per attempt keeps a double-submit from creating two orders. */
function newIdempotencyKey(): string {
  return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CheckoutFlow() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { cart, refresh: refreshCart } = useCart();
  const config = useStoreConfig();
  const { store, installments } = config;
  const creditPlans = offeredMethods(config);
  const { isAuthenticated, user, needsProfile, refresh: refreshSession } = useSession();

  const [step, setStep] = useState<StepKey>('cart');
  const [chosenAddressId, setAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [chosenShippingMethodId, setShippingMethodId] = useState<string | null>(null);
  const [chosenPaymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [chosenPaymentMode, setPaymentMode] = useState<PaymentMode | null>(null);
  // «خرید قسطی با …» on a product page arrives with ?method=; it is only a
  // preference and applies while that method is offered for this basket
  const [preferredMethod, setPreferredMethod] = useState<string | null>(null);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the URL is only readable after mount
    setPreferredMethod(new URLSearchParams(window.location.search).get('method')?.toUpperCase() ?? null);
  }, []);
  const [notes, setNotes] = useState('');
  const [idempotencyKey, setIdempotencyKey] = useState(newIdempotencyKey);

  // «begin_checkout» once, as soon as the basket is known to hold something
  const checkoutTracked = useRef(false);
  useEffect(() => {
    if (checkoutTracked.current || !cart || cart.items.length === 0) return;
    checkoutTracked.current = true;
    trackBeginCheckout(cart);
  }, [cart]);

  const { data: addresses, isLoading: addressesLoading } = useQuery({
    queryKey: queryKeys.addresses,
    queryFn: () => api.get<AddressDto[]>('/users/me/addresses'),
    enabled: isAuthenticated,
  });

  // the chosen address falls back to the default one — derived, so no effect
  const addressId =
    chosenAddressId ?? (addresses?.find((address) => address.isDefault) ?? addresses?.[0])?.id ?? null;
  const selectedAddress = addresses?.find((address) => address.id === addressId) ?? null;

  const { data: quote, isFetching: quoteLoading } = useQuery({
    // the quote is asked for with what the customer explicitly picked; the API
    // fills in its own defaults, which the fallbacks below then read back
    queryKey: queryKeys.checkoutQuote({ addressId, chosenShippingMethodId, coupon: cart?.couponCode }),
    queryFn: () =>
      api.post<CheckoutQuoteDto>('/checkout/quote', {
        addressId: addressId ?? undefined,
        shippingMethodId: chosenShippingMethodId ?? undefined,
      }),
    enabled: isAuthenticated && Boolean(cart?.items.length),
    staleTime: 10_000,
  });

  // shipping and payment default to the first usable option of the live quote
  const shippingMethodId =
    chosenShippingMethodId ??
    quote?.shippingMethods.find((method) => method.id === quote.selectedShippingMethodId && method.available)
      ?.id ??
    quote?.shippingMethods.find((method) => method.available)?.id ??
    null;
  const defaultPaymentMethod =
    chosenPaymentMethod ??
    quote?.paymentMethods.find((method) => method.eligible && method.method === preferredMethod)?.method ??
    quote?.paymentMethods.find((method) => method.eligible)?.method ??
    null;
  const defaultOption =
    quote?.paymentMethods.find((method) => method.method === defaultPaymentMethod) ?? null;
  // cash or instalments: what the customer picked, else whatever the chosen gateway is
  const paymentMode: PaymentMode = chosenPaymentMode ?? (defaultOption ? modeOf(defaultOption) : 'cash');
  // a gateway only counts while it belongs to the way of paying on screen
  const paymentOption =
    defaultOption && defaultOption.eligible && modeOf(defaultOption) === paymentMode ? defaultOption : null;
  const paymentMethod = paymentOption?.method ?? null;
  const paymentPlan =
    paymentOption && modeOf(paymentOption) === 'credit'
      ? creditBreakdown(
          paymentOption,
          quote?.summary.total ?? 0,
          installments.find((term) => term.method === paymentOption.method),
        )
      : null;

  const submit = useMutation({
    mutationFn: () =>
      api.post<CheckoutResponseDto>(
        '/checkout',
        {
          addressId,
          shippingMethodId,
          paymentMethod,
          notes: notes.trim() || undefined,
          couponCode: cart?.couponCode ?? undefined,
        },
        { 'Idempotency-Key': idempotencyKey },
      ),
    onSuccess: async (response) => {
      await Promise.all([refreshCart(), queryClient.invalidateQueries({ queryKey: queryKeys.orders(1) })]);
      if (response.payment?.redirectUrl) {
        setStep('done');
        window.location.assign(response.payment.redirectUrl);
        return;
      }
      toast.error(response.paymentError ?? 'پرداخت آغاز نشد؛ از صفحه سفارش دوباره تلاش کن.');
      router.push(`/account/orders/${response.order.id}`);
    },
    onError: (error) => {
      setIdempotencyKey(newIdempotencyKey());
      toast.error(errorMessage(error));
    },
  });

  const completed: Record<StepKey, boolean> = {
    cart: Boolean(cart?.items.length) && cart!.issues.length === 0,
    auth: isAuthenticated && !needsProfile,
    address: Boolean(addressId),
    shipping: Boolean(shippingMethodId),
    payment: Boolean(paymentMethod),
    review: false,
    done: false,
  };

  const goNext = useCallback(() => {
    const order: StepKey[] = ['cart', 'auth', 'address', 'shipping', 'payment', 'review'];
    const index = order.indexOf(step);
    if (index >= 0 && index < order.length - 1) setStep(order[index + 1]!);
  }, [step]);

  if (!cart || cart.items.length === 0) {
    return (
      <EmptyState
        icon={ShoppingBag}
        title="سبد خرید خالی است"
        description="برای تکمیل خرید، ابتدا محصولی به سبد اضافه کن."
        action={
          <Button asChild>
            <Link href="/shop">مشاهده محصولات</Link>
          </Button>
        }
        className="border-dashed"
      />
    );
  }

  const summary = quote?.summary ?? cart.summary;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1.5fr_1fr]">
      <div className="min-w-0 space-y-4">
        <Stepper current={step} completed={completed} onSelect={setStep} />

        {step === 'cart' ? (
          <StepCard title="۱. بازبینی سبد خرید">
            <ul className="divide-y divide-line">
              {cart.items.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-3">
                  <span className="relative size-16 shrink-0 overflow-hidden rounded-xl bg-surface-2">
                    <ProductImage src={item.image} alt={item.productName} sizes="64px" className="p-1" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-ink">
                      {item.productName}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted">
                      {item.storage.labelFa} · {item.color.name} · {formatNumberFa(item.quantity)} عدد
                    </span>
                    <span className="mt-0.5 block text-[11px] text-muted-faint">
                      {item.shippingTimeLabel}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-medium text-ink tabular">
                    {formatToman(item.lineTotal)}
                  </span>
                </li>
              ))}
            </ul>

            {cart.issues.length > 0 ? (
              <p className="mt-3 flex items-start gap-2 rounded-2xl bg-danger-soft px-3 py-2.5 text-[12px] text-danger">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                برای ادامه، موارد مشکل‌دار سبد را در صفحه سبد خرید اصلاح کن.
              </p>
            ) : null}

            <div className="mt-4 flex gap-2">
              <Button size="md" onClick={goNext} disabled={cart.issues.length > 0}>
                تأیید و ادامه
              </Button>
              <Button asChild size="md" variant="ghost">
                <Link href="/cart">ویرایش سبد</Link>
              </Button>
            </div>
          </StepCard>
        ) : null}

        {step === 'auth' ? (
          <StepCard title="۲. ورود به حساب">
            {isAuthenticated && !needsProfile ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-line p-4">
                <div>
                  <p className="text-[13px] font-medium text-ink">{user?.fullName ?? 'کاربر آیفونی‌ها'}</p>
                  <p className="mt-0.5 text-[11px] text-muted font-display">{user?.phone}</p>
                </div>
                <Button size="sm" onClick={goNext}>
                  ادامه
                </Button>
              </div>
            ) : (
              <LoginFlow
                compact
                onSuccess={() => {
                  void refreshSession();
                  void refreshCart();
                  setStep('address');
                }}
              />
            )}
          </StepCard>
        ) : null}

        {step === 'address' ? (
          <StepCard title="۳. آدرس تحویل">
            {addressesLoading ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : addingAddress || (addresses && addresses.length === 0) ? (
              <AddressForm
                onSaved={async (address) => {
                  await queryClient.invalidateQueries({ queryKey: queryKeys.addresses });
                  setAddressId(address.id);
                  setAddingAddress(false);
                  setStep('shipping');
                }}
                onCancel={addresses && addresses.length > 0 ? () => setAddingAddress(false) : undefined}
                submitLabel="ذخیره و ادامه"
              />
            ) : (
              <>
                <RadioGroup value={addressId ?? ''} onValueChange={setAddressId} className="grid gap-2">
                  {addresses?.map((address) => (
                    <RadioCard key={address.id} value={address.id}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-[13px] font-medium text-ink">
                          {address.title || address.recipientName}
                          {address.isDefault ? (
                            <span className="ms-2 rounded-pill bg-surface px-2 py-0.5 text-[10px] text-muted">
                              پیش‌فرض
                            </span>
                          ) : null}
                        </p>
                      </div>
                      <p className="mt-1 text-[12px] leading-6 text-muted">
                        {address.province}، {address.city} — {address.addressLine}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-faint font-display">{address.mobile}</p>
                    </RadioCard>
                  ))}
                </RadioGroup>

                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="md" onClick={goNext} disabled={!addressId}>
                    تأیید آدرس
                  </Button>
                  <Button size="md" variant="outline" onClick={() => setAddingAddress(true)}>
                    <Plus className="size-4" aria-hidden />
                    آدرس جدید
                  </Button>
                </div>
              </>
            )}
          </StepCard>
        ) : null}

        {step === 'shipping' ? (
          <StepCard title="۴. روش ارسال">
            {quoteLoading && !quote ? (
              <Skeleton className="h-24 rounded-2xl" />
            ) : (
              <>
                <RadioGroup
                  value={shippingMethodId ?? ''}
                  onValueChange={setShippingMethodId}
                  className="grid gap-2"
                >
                  {quote?.shippingMethods.map((method) => (
                    <RadioCard key={method.id} value={method.id} disabled={!method.available}>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-ink">{method.name}</p>
                          <p className="mt-0.5 text-[11px] text-muted">{method.etaLabel}</p>
                          {!method.available && method.unavailableReason ? (
                            <p className="mt-1 text-[11px] text-danger">{method.unavailableReason}</p>
                          ) : null}
                        </div>
                        <span className="shrink-0 text-[13px] font-medium text-ink tabular">
                          {method.isFree ? 'رایگان' : formatToman(method.cost)}
                        </span>
                      </div>
                    </RadioCard>
                  ))}
                </RadioGroup>
                <Button size="md" className="mt-4" onClick={goNext} disabled={!shippingMethodId}>
                  تأیید روش ارسال
                </Button>
              </>
            )}
          </StepCard>
        ) : null}

        {step === 'payment' ? (
          <StepCard title="۵. روش پرداخت">
            {quoteLoading && !quote ? (
              <Skeleton className="h-40 rounded-2xl" />
            ) : quote && quote.paymentMethods.length === 0 && creditPlans.length === 0 ? (
              // no live gateway yet: say so plainly instead of an empty list and a dead button
              <div className="rounded-2xl border border-line bg-surface p-4 text-[13px] leading-7 text-ink-muted">
                <p className="font-medium text-ink">پرداخت آنلاین در حال حاضر فعال نیست.</p>
                <p className="mt-1">
                  برای ثبت این سفارش با کارشناسان فروشگاه تماس بگیر:{' '}
                  <a
                    href={telHref(store.phone)}
                    className="font-medium text-ink underline underline-offset-4"
                  >
                    {store.phone}
                  </a>
                </p>
              </div>
            ) : quote ? (
              <CheckoutPayment
                options={quote.paymentMethods}
                amount={summary.total}
                terms={installments}
                creditPlans={creditPlans}
                value={paymentMethod}
                mode={paymentMode}
                onModeChange={setPaymentMode}
                onChange={setPaymentMethod}
                onContinue={goNext}
              />
            ) : null}
          </StepCard>
        ) : null}

        {step === 'review' ? (
          <StepCard title="۶. بازبینی و ثبت سفارش">
            <dl className="grid gap-3 text-[13px]">
              <ReviewRow label="تحویل‌گیرنده" value={selectedAddress?.recipientName ?? '—'} />
              <ReviewRow
                label="آدرس"
                value={
                  selectedAddress
                    ? `${selectedAddress.province}، ${selectedAddress.city} — ${selectedAddress.addressLine}`
                    : '—'
                }
              />
              <ReviewRow
                label="روش ارسال"
                value={quote?.shippingMethods.find((m) => m.id === shippingMethodId)?.name ?? '—'}
              />
              <ReviewRow
                label="روش پرداخت"
                value={
                  paymentOption
                    ? paymentPlan
                      ? `خرید قسطی با ${paymentOption.name}`
                      : `پرداخت نقدی — ${paymentOption.name}`
                    : '—'
                }
              />
            </dl>

            {paymentOption && paymentPlan ? (
              <div className="mt-4 flex items-center gap-3 rounded-2xl border border-line bg-surface-2 p-3.5">
                <PaymentLogo method={paymentOption.method} size={40} />
                <p className="min-w-0 flex-1 text-[12px] leading-6 text-ink-muted">
                  {paymentPlan.downPayment > 0
                    ? `پیش‌پرداخت ${formatToman(paymentPlan.downPayment)} و `
                    : 'بدون پیش‌پرداخت، '}
                  {formatNumberFa(paymentPlan.months)} قسط ماهانهٔ{' '}
                  <span className="font-semibold text-ink tabular">{formatToman(paymentPlan.monthly)}</span>
                  <span className="block text-[11px] text-muted">
                    بعد از ثبت سفارش به {paymentOption.name} می‌روی تا اعتبارت تأیید و خرید نهایی شود.
                  </span>
                </p>
              </div>
            ) : null}

            <div className="mt-4">
              <Textarea
                rows={2}
                placeholder="توضیح برای سفارش (اختیاری)"
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                aria-label="توضیح سفارش"
              />
            </div>

            <Button
              size="lg"
              block
              className="mt-4"
              loading={submit.isPending}
              disabled={!addressId || !shippingMethodId || !paymentMethod}
              onClick={() => submit.mutate()}
            >
              {paymentPlan && paymentOption
                ? `ثبت سفارش و رفتن به ${paymentOption.name}`
                : 'ثبت سفارش و پرداخت'}
            </Button>
            <p className="mt-3 text-center text-[11px] leading-5 text-muted-faint">
              با ثبت سفارش، موجودی کالا برای شما رزرو می‌شود و تا پایان مهلت پرداخت محفوظ می‌ماند.
            </p>
          </StepCard>
        ) : null}

        {step === 'done' ? (
          <StepCard title="۷. انتقال به درگاه پرداخت">
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="size-6 animate-spin text-muted" aria-hidden />
              <p className="text-[13px] text-muted">
                {paymentOption ? `در حال انتقال به ${paymentOption.name}…` : 'در حال انتقال به درگاه پرداخت…'}
              </p>
            </div>
          </StepCard>
        ) : null}
      </div>

      <aside className="sticky top-24 min-w-0 space-y-3 rounded-panel border border-line p-5">
        <h2 className="text-[15px] font-semibold text-ink">خلاصه پرداخت</h2>
        <dl className="grid gap-2.5 text-[13px]">
          <ReviewRow
            label={`کالاها (${formatNumberFa(summary.itemsCount)})`}
            value={formatToman(summary.subtotal)}
          />
          {summary.discount > 0 ? (
            <ReviewRow label="تخفیف" value={`−${formatToman(summary.discount)}`} tone="success" />
          ) : null}
          <ReviewRow
            label="هزینه ارسال"
            value={
              summary.shipping === null
                ? 'انتخاب نشده'
                : summary.shipping === 0
                  ? 'رایگان'
                  : formatToman(summary.shipping)
            }
          />
        </dl>
        <div className="flex items-center justify-between border-t border-line pt-3">
          <span className="text-[13px] font-medium text-ink">مبلغ قابل پرداخت</span>
          <span className="text-lg font-semibold text-ink tabular">{formatToman(summary.total)}</span>
        </div>
        {paymentOption && paymentPlan ? (
          <div className="space-y-2 rounded-2xl bg-surface-2 p-3 text-[12px]">
            <p className="flex items-center gap-2 font-medium text-ink">
              <PaymentLogo method={paymentOption.method} size={22} rounded="full" />
              قسطی با {paymentOption.name}
            </p>
            <dl className="grid gap-1.5">
              <ReviewRow
                label="پیش‌پرداخت"
                value={paymentPlan.downPayment > 0 ? formatToman(paymentPlan.downPayment) : 'ندارد'}
              />
              <ReviewRow
                label={`${formatNumberFa(paymentPlan.months)} قسط ماهانه`}
                value={formatToman(paymentPlan.monthly)}
              />
            </dl>
          </div>
        ) : null}
        {quoteLoading ? <p className="text-[11px] text-muted-faint">در حال به‌روزرسانی…</p> : null}
      </aside>
    </div>
  );
}

function Stepper({
  current,
  completed,
  onSelect,
}: {
  current: StepKey;
  completed: Record<StepKey, boolean>;
  onSelect: (step: StepKey) => void;
}) {
  return (
    <ol className="no-scrollbar flex items-center gap-1 overflow-x-auto rounded-panel border border-line p-2">
      {STEPS.map((step, index) => {
        const active = step.key === current;
        const done = completed[step.key];
        return (
          <li key={step.key} className="shrink-0">
            <button
              type="button"
              onClick={() => (done || active ? onSelect(step.key) : null)}
              disabled={!done && !active}
              className={cn(
                'flex items-center gap-2 rounded-pill px-3 py-2 text-[12px] transition-colors',
                active ? 'bg-ink text-white' : done ? 'text-ink hover:bg-surface' : 'text-muted-faint',
              )}
            >
              <span
                className={cn(
                  'grid size-5 place-items-center rounded-full text-[10px] tabular',
                  active ? 'bg-white/15' : done ? 'bg-success-soft text-success' : 'bg-surface',
                )}
              >
                {done && !active ? <Check className="size-3" /> : formatNumberFa(index + 1)}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function StepCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-panel border border-line p-5">
      <h2 className="mb-4 text-[15px] font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function ReviewRow({ label, value, tone }: { label: string; value: string; tone?: 'success' }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={cn('text-end', tone === 'success' ? 'text-success tabular' : 'text-ink')}>{value}</dd>
    </div>
  );
}
