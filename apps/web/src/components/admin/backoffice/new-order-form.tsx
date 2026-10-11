'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Plus, Store, Phone, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  IRAN_PROVINCES,
  MANUAL_PAYMENT_CHANNEL_LABELS,
  digitsOnly,
  formatNumberFa,
  formatToman,
  type AdminCustomerDto,
  type AdminOrderDto,
  type CreditSettings,
  type DeviceUnitDto,
  type Paginated,
  type PricingRowDto,
  type ShippingMethodAdminDto,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { ApiError } from '@/lib/api/errors';
import { Button } from '@/components/ui/button';
import { Input, Textarea } from '@/components/ui/input';
import { Field } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import {
  ContractBuilder,
  contractPayload,
  contractProblems,
  draftTotals,
  emptyContract,
  type ContractDraft,
} from './contract-builder';
import { MoneyInput, formError } from './inputs';
import { VariantPicker, useVariants, variantLabel } from './variant-picker';

type Source = 'IN_STORE' | 'PHONE';
type PaymentKind = 'IN_STORE' | 'CHEQUE' | 'SAFTE';
type Channel = 'POS' | 'CASH' | 'TRANSFER';

interface Line {
  key: string;
  variantId: string | null;
  quantity: number;
  deviceIds: string[];
}

let lineCounter = 0;
const newLine = (): Line => ({ key: `l${++lineCounter}`, variantId: null, quantity: 1, deviceIds: [] });

function Choice<T extends string>({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: T;
  options: { value: T; label: string; icon?: React.ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={name} className="flex flex-wrap gap-2">
      {options.map((option) => (
        <label
          key={option.value}
          className={cn(
            'flex cursor-pointer items-center gap-2 rounded-pill border px-4 py-2 text-[13px] transition-colors',
            value === option.value
              ? 'border-ink bg-ink text-white'
              : 'border-line text-ink-muted hover:bg-surface',
          )}
        >
          <input
            type="radio"
            name={name}
            className="sr-only"
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          {option.icon}
          {option.label}
        </label>
      ))}
    </div>
  );
}

/** The phones of one colour and capacity on the shelf, to hand over with the sale. */
function DevicePicker({ line, onChange }: { line: Line; onChange: (deviceIds: string[]) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'devices', 'in-stock', line.variantId],
    queryFn: () =>
      api.get<Paginated<DeviceUnitDto>>('/admin/devices', {
        variantId: line.variantId!,
        status: 'IN_STOCK',
        pageSize: 200,
      }),
    enabled: Boolean(line.variantId),
  });
  if (!line.variantId) return null;
  if (isLoading) return <p className="text-[12px] text-muted">در حال خواندن IMEIهای انبار…</p>;
  const units = data?.items ?? [];
  if (!units.length)
    return (
      <p className="text-[12px] text-muted">
        از این مدل گوشی با IMEI در انبار ثبت نشده؛ IMEI را می‌شود بعداً روی سفارش ثبت کرد.
      </p>
    );
  return (
    <fieldset>
      <legend className="mb-1 text-[12px] text-muted">
        IMEI گوشی‌هایی که تحویل می‌شود ({formatNumberFa(line.deviceIds.length)} از{' '}
        {formatNumberFa(line.quantity)})
      </legend>
      <div className="flex flex-wrap gap-1.5">
        {units.map((unit) => {
          const checked = line.deviceIds.includes(unit.id);
          return (
            <label
              key={unit.id}
              className={cn(
                'flex cursor-pointer items-center gap-1.5 rounded-pill border px-3 py-1 font-display text-[12px] tabular',
                checked ? 'border-ink bg-ink text-white' : 'border-line text-ink-muted',
              )}
              dir="ltr"
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                disabled={!checked && line.deviceIds.length >= line.quantity}
                onChange={() =>
                  onChange(
                    checked ? line.deviceIds.filter((id) => id !== unit.id) : [...line.deviceIds, unit.id],
                  )
                }
              />
              {unit.imei}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/**
 * «ثبت سفارش تلفنی یا حضوری»: the customer, the phones (with their IMEIs),
 * delivery and payment — at the counter, or as a cheque or promissory-note
 * contract written in the same step.
 */
export function NewOrderForm({
  shippingMethods,
  credit,
  canLookupCustomers,
}: {
  shippingMethods: ShippingMethodAdminDto[];
  credit: CreditSettings;
  canLookupCustomers: boolean;
}) {
  const router = useRouter();
  const variants = useVariants();
  const [source, setSource] = useState<Source>('IN_STORE');
  const [phone, setPhone] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [lines, setLines] = useState<Line[]>([newLine()]);
  const [discount, setDiscount] = useState<number | null>(null);
  const [delivery, setDelivery] = useState<'PICKUP' | 'SHIP'>('PICKUP');
  const [shippingMethodId, setShippingMethodId] = useState(shippingMethods[0]?.id ?? '');
  /** undefined: the shipping method's own price */
  const [shippingOverride, setShippingOverride] = useState<number | null | undefined>(undefined);
  const [address, setAddress] = useState({
    recipientName: '',
    mobile: '',
    province: 'تهران',
    city: '',
    addressLine: '',
    postalCode: '',
    plaque: '',
    unit: '',
  });
  const [payment, setPayment] = useState<PaymentKind>('IN_STORE');
  const [channel, setChannel] = useState<Channel>('POS');
  const [reference, setReference] = useState('');
  const [contract, setContract] = useState<ContractDraft | null>(null);
  const [handedOver, setHandedOver] = useState(true);
  const [notifyCustomer, setNotifyCustomer] = useState(false);
  const [adminNote, setAdminNote] = useState('');
  const [pending, setPending] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);

  const rows = useMemo(
    () => new Map((variants.data ?? []).map((row) => [row.variantId, row])),
    [variants.data],
  );
  const itemsTotal = lines.reduce(
    (sum, line) => sum + (line.variantId ? (rows.get(line.variantId)?.price ?? 0) * line.quantity : 0),
    0,
  );
  const chosenMethod = shippingMethods.find((m) => m.id === shippingMethodId);
  const methodCost =
    chosenMethod &&
    !(chosenMethod.freeThreshold !== null && itemsTotal - (discount ?? 0) >= chosenMethod.freeThreshold)
      ? chosenMethod.baseCost
      : 0;
  const shippingCost = shippingOverride === undefined ? methodCost : shippingOverride;
  const shipping = delivery === 'SHIP' ? (shippingCost ?? 0) : 0;
  const total = Math.max(0, itemsTotal - (discount ?? 0)) + shipping;
  const customerName = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');
  const method = payment === 'IN_STORE' ? null : payment;

  // a returning customer: their name comes from their account (null: a new customer)
  const cleanPhone = digitsOnly(phone);
  const validPhone = /^09\d{9}$/.test(cleanPhone);
  const lookup = useQuery({
    queryKey: ['admin', 'customer', cleanPhone],
    queryFn: async () => {
      try {
        return await api.get<AdminCustomerDto>(`/admin/customers/${cleanPhone}`);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    enabled: canLookupCustomers && validPhone,
    retry: false,
    staleTime: 60_000,
  });
  const known = validPhone ? lookup.data : undefined;
  const [prefilled, setPrefilled] = useState<string | null>(null);
  if (known && prefilled !== known.id) {
    setPrefilled(known.id);
    if (!firstName && known.firstName) setFirstName(known.firstName);
    if (!lastName && known.lastName) setLastName(known.lastName);
  }

  function setLine(key: string, patch: Partial<Line>) {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  }

  function choosePayment(next: PaymentKind) {
    setPayment(next);
    if (next !== 'IN_STORE') {
      setContract(
        (current) => current ?? emptyContract(next === 'CHEQUE' ? credit.cheque : credit.safte, total),
      );
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found: string[] = [];
    if (!/^09\d{9}$/.test(cleanPhone)) found.push('موبایل مشتری را درست وارد کن');
    if (!lines.some((line) => line.variantId)) found.push('دست‌کم یک کالا انتخاب کن');
    if (method && !customerName) found.push('برای قرارداد، نام و نام خانوادگی مشتری لازم است');
    if (
      delivery === 'SHIP' &&
      (!address.recipientName.trim() ||
        !address.city.trim() ||
        address.addressLine.trim().length < 10 ||
        digitsOnly(address.postalCode).length !== 10)
    ) {
      found.push('نشانی ارسال را کامل کن (گیرنده، شهر، نشانی و کد پستی ۱۰ رقمی)');
    }
    if (method && contract) found.push(...contractProblems(contract, total, method));
    setProblems(found);
    if (found.length) return;

    setPending(true);
    try {
      const order = await api.post<AdminOrderDto>('/admin/orders', {
        source,
        customer: {
          phone: cleanPhone,
          firstName: firstName.trim() || null,
          lastName: lastName.trim() || null,
        },
        items: lines
          .filter((line) => line.variantId)
          .map((line) => ({ variantId: line.variantId, quantity: line.quantity, deviceIds: line.deviceIds })),
        discount: discount ?? 0,
        delivery:
          delivery === 'PICKUP'
            ? { type: 'PICKUP' }
            : {
                type: 'SHIP',
                shippingMethodId,
                shippingCost: shippingCost ?? 0,
                address: {
                  recipientName: address.recipientName.trim(),
                  mobile: digitsOnly(address.mobile) || cleanPhone,
                  province: address.province,
                  city: address.city.trim(),
                  addressLine: address.addressLine.trim(),
                  postalCode: digitsOnly(address.postalCode),
                  plaque: address.plaque.trim() || null,
                  unit: address.unit.trim() || null,
                },
              },
        payment:
          payment === 'IN_STORE'
            ? { method: 'IN_STORE', channel, reference: reference.trim() || null }
            : {
                method: payment,
                contract: { ...contractPayload(contract!, customerName), itemDescription: null },
              },
        handedOver: delivery === 'PICKUP' && handedOver,
        notifyCustomer,
        adminNote: adminNote.trim() || null,
      });
      toast.success(
        `سفارش ${order.orderNumber} ثبت شد${order.contract ? ` با قرارداد شمارهٔ ${formatNumberFa(order.contract.number)}` : ''}`,
      );
      router.push(`/admin/orders/${order.id}`);
      router.refresh();
    } catch (error) {
      toast.error(formError(error));
      setPending(false);
    }
  }

  const selected = lines.map((line) => (line.variantId ? rows.get(line.variantId) : undefined));
  const plan = method === 'CHEQUE' ? credit.cheque : method === 'SAFTE' ? credit.safte : null;

  return (
    <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_22rem] xl:items-start">
      <div className="grid min-w-0 gap-4">
        <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
          <h2 className="text-[15px] font-semibold text-ink">مشتری</h2>
          <Choice
            name="منبع سفارش"
            value={source}
            onChange={(next) => {
              setSource(next);
              if (next === 'PHONE') setHandedOver(false);
            }}
            options={[
              { value: 'IN_STORE', label: 'فروش حضوری', icon: <Store className="size-4" aria-hidden /> },
              { value: 'PHONE', label: 'سفارش تلفنی', icon: <Phone className="size-4" aria-hidden /> },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="موبایل"
              htmlFor="customer-phone"
              hint={
                known
                  ? `مشتری قبلی — ${formatNumberFa(known.stats.paidOrders)} خرید${known.stats.ledgerOutstanding ? `، ${formatToman(known.stats.ledgerOutstanding)} اقساط باز` : ''}`
                  : known === null
                    ? 'مشتری تازه؛ حسابش با همین موبایل ساخته می‌شود'
                    : undefined
              }
            >
              <Input
                id="customer-phone"
                dir="ltr"
                inputMode="tel"
                className="font-display"
                placeholder="09121234567"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </Field>
            <Field label="نام" htmlFor="customer-first">
              <Input
                id="customer-first"
                value={firstName}
                maxLength={40}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </Field>
            <Field label="نام خانوادگی" htmlFor="customer-last">
              <Input
                id="customer-last"
                value={lastName}
                maxLength={60}
                onChange={(event) => setLastName(event.target.value)}
              />
            </Field>
          </div>
        </section>

        <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
          <h2 className="text-[15px] font-semibold text-ink">کالا</h2>
          {lines.map((line, index) => {
            const row = selected[index];
            return (
              <div key={line.key} className="grid gap-3 rounded-2xl border border-line p-3">
                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto] sm:items-end">
                  <Field label={`کالای ${formatNumberFa(index + 1)}`} htmlFor={`line-${line.key}`}>
                    <VariantPicker
                      id={`line-${line.key}`}
                      pricedOnly
                      value={line.variantId}
                      onChange={(picked: PricingRowDto | null) =>
                        setLine(line.key, { variantId: picked?.variantId ?? null, deviceIds: [] })
                      }
                    />
                  </Field>
                  <Field label="تعداد" htmlFor={`qty-${line.key}`}>
                    <Input
                      id={`qty-${line.key}`}
                      type="number"
                      min={1}
                      max={10}
                      value={line.quantity}
                      onChange={(event) => {
                        const quantity = Math.max(1, Math.min(10, Number(event.target.value) || 1));
                        setLine(line.key, { quantity, deviceIds: line.deviceIds.slice(0, quantity) });
                      }}
                    />
                  </Field>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="sm:mb-0.5"
                    aria-label={`حذف کالای ${index + 1}`}
                    disabled={lines.length === 1}
                    onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                  >
                    <Trash2 />
                  </Button>
                </div>
                {row ? (
                  <p className="text-[12px] text-muted">
                    {variantLabel(row)} · {formatToman(row.price)} × {formatNumberFa(line.quantity)} ={' '}
                    <span className="text-ink tabular">{formatToman(row.price * line.quantity)}</span>
                    {row.available < line.quantity ? (
                      <span className="ms-2 text-danger">
                        موجودی کافی نیست ({formatNumberFa(row.available)})
                      </span>
                    ) : null}
                  </p>
                ) : null}
                <DevicePicker line={line} onChange={(deviceIds) => setLine(line.key, { deviceIds })} />
              </div>
            );
          })}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setLines((current) => [...current, newLine()])}
            disabled={lines.length >= 10}
          >
            <Plus aria-hidden />
            کالای دیگر
          </Button>
          <Field label="تخفیف روی کل فاکتور (تومان، اختیاری)" htmlFor="order-discount" className="max-w-xs">
            <MoneyInput id="order-discount" value={discount} onChange={setDiscount} />
          </Field>
        </section>

        <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
          <h2 className="text-[15px] font-semibold text-ink">تحویل</h2>
          <Choice
            name="تحویل"
            value={delivery}
            onChange={setDelivery}
            options={[
              { value: 'PICKUP', label: 'تحویل حضوری در فروشگاه' },
              { value: 'SHIP', label: 'ارسال' },
            ]}
          />
          {delivery === 'PICKUP' ? (
            <label className="flex items-center gap-2 text-[13px] text-ink">
              <input
                type="checkbox"
                className="size-4"
                checked={handedOver}
                onChange={(event) => setHandedOver(event.target.checked)}
              />
              گوشی همین حالا تحویل مشتری شد (سفارش «تحویل شده» ثبت می‌شود)
            </label>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="روش ارسال" htmlFor="ship-method">
                <select
                  id="ship-method"
                  className="h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm"
                  value={shippingMethodId}
                  onChange={(event) => {
                    setShippingMethodId(event.target.value);
                    setShippingOverride(undefined);
                  }}
                >
                  {shippingMethods.map((method) => (
                    <option key={method.id} value={method.id}>
                      {method.name} — {method.etaLabel}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="هزینهٔ ارسال (تومان)" htmlFor="ship-cost">
                <MoneyInput id="ship-cost" value={shippingCost} onChange={setShippingOverride} />
              </Field>
              <Field label="نام گیرنده" htmlFor="ship-name">
                <Input
                  id="ship-name"
                  value={address.recipientName}
                  placeholder={customerName}
                  onChange={(event) => setAddress({ ...address, recipientName: event.target.value })}
                />
              </Field>
              <Field label="موبایل گیرنده" htmlFor="ship-mobile">
                <Input
                  id="ship-mobile"
                  dir="ltr"
                  className="font-display"
                  placeholder={cleanPhone}
                  value={address.mobile}
                  onChange={(event) => setAddress({ ...address, mobile: event.target.value })}
                />
              </Field>
              <Field label="استان" htmlFor="ship-province">
                <select
                  id="ship-province"
                  className="h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm"
                  value={address.province}
                  onChange={(event) => setAddress({ ...address, province: event.target.value })}
                >
                  {IRAN_PROVINCES.map((province) => (
                    <option key={province} value={province}>
                      {province}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="شهر" htmlFor="ship-city">
                <Input
                  id="ship-city"
                  value={address.city}
                  onChange={(event) => setAddress({ ...address, city: event.target.value })}
                />
              </Field>
              <Field label="نشانی کامل" htmlFor="ship-line" className="sm:col-span-2">
                <Input
                  id="ship-line"
                  value={address.addressLine}
                  onChange={(event) => setAddress({ ...address, addressLine: event.target.value })}
                />
              </Field>
              <Field label="کد پستی" htmlFor="ship-postal">
                <Input
                  id="ship-postal"
                  dir="ltr"
                  inputMode="numeric"
                  className="font-display"
                  maxLength={12}
                  value={address.postalCode}
                  onChange={(event) => setAddress({ ...address, postalCode: event.target.value })}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="پلاک" htmlFor="ship-plaque">
                  <Input
                    id="ship-plaque"
                    value={address.plaque}
                    onChange={(event) => setAddress({ ...address, plaque: event.target.value })}
                  />
                </Field>
                <Field label="واحد" htmlFor="ship-unit">
                  <Input
                    id="ship-unit"
                    value={address.unit}
                    onChange={(event) => setAddress({ ...address, unit: event.target.value })}
                  />
                </Field>
              </div>
            </div>
          )}
        </section>

        <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
          <h2 className="text-[15px] font-semibold text-ink">پرداخت</h2>
          <Choice
            name="روش پرداخت"
            value={payment}
            onChange={choosePayment}
            options={[
              { value: 'IN_STORE', label: 'نقد، کارتخوان یا کارت‌به‌کارت' },
              ...(credit.cheque.enabled ? [{ value: 'CHEQUE' as const, label: 'اقساط با چک صیادی' }] : []),
              ...(credit.safte.enabled ? [{ value: 'SAFTE' as const, label: 'اقساط با سفته' }] : []),
            ]}
          />
          {payment === 'IN_STORE' ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="با" htmlFor="pay-channel">
                <select
                  id="pay-channel"
                  className="h-12 w-full rounded-2xl border border-line bg-canvas px-3 text-sm"
                  value={channel}
                  onChange={(event) => setChannel(event.target.value as Channel)}
                >
                  {(['POS', 'CASH', 'TRANSFER'] as const).map((option) => (
                    <option key={option} value={option}>
                      {MANUAL_PAYMENT_CHANNEL_LABELS[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="شمارهٔ پیگیری (اختیاری)" htmlFor="pay-reference">
                <Input
                  id="pay-reference"
                  dir="ltr"
                  className="font-display"
                  maxLength={80}
                  value={reference}
                  onChange={(event) => setReference(event.target.value)}
                />
              </Field>
            </div>
          ) : contract && method ? (
            <ContractBuilder
              method={method}
              price={total}
              customerName={customerName}
              plan={plan}
              draft={contract}
              onChange={setContract}
            />
          ) : null}
        </section>

        <section className="grid min-w-0 gap-4 rounded-panel border border-line bg-canvas p-5">
          <Field label="یادداشت داخلی (اختیاری)" htmlFor="order-note">
            <Textarea
              id="order-note"
              rows={2}
              maxLength={1000}
              value={adminNote}
              onChange={(event) => setAdminNote(event.target.value)}
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-ink">
            <input
              type="checkbox"
              className="size-4"
              checked={notifyCustomer}
              onChange={(event) => setNotifyCustomer(event.target.checked)}
            />
            پیامک «سفارش موفق» (و در فروش قسطی «دفترچهٔ اقساط») برای مشتری فرستاده شود
          </label>
        </section>
      </div>

      <aside className="grid gap-3 rounded-panel border border-line bg-canvas p-5 xl:sticky xl:top-20">
        <h2 className="text-[15px] font-semibold text-ink">خلاصه</h2>
        <dl className="grid gap-2 text-[13px]">
          <Summary label="جمع کالاها" value={formatToman(itemsTotal)} />
          {discount ? <Summary label="تخفیف" value={`− ${formatToman(discount)}`} /> : null}
          {delivery === 'SHIP' ? (
            <Summary label="ارسال" value={shipping ? formatToman(shipping) : 'رایگان'} />
          ) : null}
          <div className="flex justify-between border-t border-line pt-2 text-[15px] font-semibold text-ink">
            <dt>مبلغ کل</dt>
            <dd className="tabular">{formatToman(total)}</dd>
          </div>
          {contract && method ? (
            <>
              <Summary label="پیش‌پرداخت" value={formatToman(draftTotals(contract, total).downPayment)} />
              <Summary label="جمع اقساط" value={formatToman(draftTotals(contract, total).scheduled)} />
              <Summary label="کل پرداختی مشتری" value={formatToman(draftTotals(contract, total).total)} />
            </>
          ) : null}
        </dl>
        {problems.length ? (
          <ul
            className="grid gap-1 rounded-2xl bg-danger-soft px-4 py-3 text-[12px] text-danger"
            role="alert"
          >
            {problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        ) : null}
        <Button type="submit" loading={pending} disabled={!total}>
          ثبت سفارش
        </Button>
        <p className="text-[11px] text-muted">
          قیمت‌ها از جدول قیمت خوانده می‌شود و موجودی همین حالا کم می‌شود.{' '}
          {method ? 'قرارداد اقساط هم‌زمان در دفتر اقساط ثبت می‌شود.' : ''}
        </p>
      </aside>
    </form>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="tabular text-ink">{value}</dd>
    </div>
  );
}
