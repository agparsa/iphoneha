'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  INSTALLMENT_METHODS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_INFO,
  creditPlanReady,
  estimateCreditPlan,
  formatNumberFa,
  formatToman,
  type AlertSettings,
  type AlertStatusDto,
  type AlertTestResultDto,
  type CommerceSettings,
  type CreditPlan,
  type CreditSettings,
  type HomeSettings,
  type LedgerSettings,
  type PaymentConnectionDto,
  type PaymentMethod,
  type PaymentSettings,
  type SeoSettings,
  type StoreSettings,
} from '@iphoneha/shared';
import { api } from '@/lib/api/client';
import { absoluteUrl } from '@/lib/utils';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field } from '@/components/ui/label';
import { Input, Textarea } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BrowserAlertsToggle } from './browser-alerts';
import type { SettingsTab } from './settings-tabs';

interface Settings {
  store: StoreSettings;
  home: HomeSettings;
  payments: PaymentSettings;
  commerce: CommerceSettings;
  seo: SeoSettings;
  credit: CreditSettings;
  alerts: AlertSettings;
  ledger: LedgerSettings;
}

export function SettingsForms({
  settings,
  alertStatus,
  paymentConnections = [],
  remindersReady = null,
  canWrite,
  tab = 'store',
}: {
  settings: Settings;
  alertStatus: AlertStatusDto | null;
  paymentConnections?: PaymentConnectionDto[];
  /** the reminder SMS pattern is set on the server (null: unknown) */
  remindersReady?: boolean | null;
  canWrite: boolean;
  /** the tab to open, e.g. from a link to /admin/settings?tab=alerts */
  tab?: SettingsTab;
}) {
  // a tab opened from a link can sit past the edge of the scrolling tab row on a phone
  const tabList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    tabList.current
      ?.querySelector<HTMLElement>('[data-state="active"]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, []);

  return (
    <Tabs defaultValue={tab}>
      <TabsList ref={tabList}>
        <TabsTrigger value="store">فروشگاه</TabsTrigger>
        <TabsTrigger value="home">صفحه اصلی</TabsTrigger>
        <TabsTrigger value="payments">پرداخت</TabsTrigger>
        <TabsTrigger value="credit">چک و سفته</TabsTrigger>
        <TabsTrigger value="ledger">دفتر اقساط</TabsTrigger>
        <TabsTrigger value="alerts">هشدارها</TabsTrigger>
        <TabsTrigger value="commerce">سبد خرید</TabsTrigger>
        <TabsTrigger value="seo">سئو و آمار</TabsTrigger>
      </TabsList>

      <TabsContent value="store">
        <StoreForm value={settings.store} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="home">
        <HomeForm value={settings.home} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="payments">
        <PaymentsForm value={settings.payments} connections={paymentConnections} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="credit">
        <CreditForm value={settings.credit} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="ledger">
        <LedgerForm value={settings.ledger} remindersReady={remindersReady} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="alerts">
        <AlertsForm value={settings.alerts} status={alertStatus} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="commerce">
        <CommerceForm value={settings.commerce} canWrite={canWrite} />
      </TabsContent>
      <TabsContent value="seo">
        <SeoForm value={settings.seo} canWrite={canWrite} />
      </TabsContent>
    </Tabs>
  );
}

function useSave(key: string) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);

  async function save(payload: unknown) {
    setErrors({});
    setPending(true);
    try {
      await api.patch(`/admin/settings/${key}`, payload);
      toast.success('تنظیمات ذخیره شد');
      router.refresh();
    } catch (cause) {
      if (cause instanceof ApiError && Object.keys(cause.fieldErrors).length > 0)
        setErrors(cause.fieldErrors);
      else toast.error(errorMessage(cause));
    } finally {
      setPending(false);
    }
  }

  return { save, errors, pending };
}

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="max-w-2xl rounded-panel border border-line p-5">{children}</section>;
}

function StoreForm({ value, canWrite }: { value: StoreSettings; canWrite: boolean }) {
  const { save, errors, pending } = useSave('store');
  const [form, setForm] = useState(value);
  const set =
    (key: keyof StoreSettings) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((state) => ({ ...state, [key]: event.target.value }));
  // optional fields are stored as null, never as an empty string
  const setOptional = (key: keyof StoreSettings) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((state) => ({ ...state, [key]: event.target.value.trim() ? event.target.value : null }));
  const setNumber = (key: 'warrantyMonths' | 'returnDays') => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((state) => ({ ...state, [key]: Number(event.target.value.replace(/[^\d]/g, '') || 0) }));

  return (
    <Panel>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save(form);
        }}
      >
        <Field label="نام فروشگاه" error={errors.name} htmlFor="s-name">
          <Input id="s-name" value={form.name} onChange={set('name')} disabled={!canWrite} />
        </Field>
        <Field label="شعار" error={errors.tagline} htmlFor="s-tagline">
          <Input id="s-tagline" value={form.tagline} onChange={set('tagline')} disabled={!canWrite} />
        </Field>
        <Field label="تلفن" error={errors.phone} htmlFor="s-phone">
          <Input id="s-phone" value={form.phone} onChange={set('phone')} disabled={!canWrite} />
        </Field>
        <Field label="ایمیل" error={errors.email} htmlFor="s-email">
          <Input
            id="s-email"
            dir="ltr"
            className="font-display"
            value={form.email ?? ''}
            onChange={(event) => setForm((state) => ({ ...state, email: event.target.value || null }))}
            disabled={!canWrite}
          />
        </Field>
        <Field label="آدرس" error={errors.address} htmlFor="s-address">
          <Textarea
            id="s-address"
            rows={2}
            value={form.address}
            onChange={set('address')}
            disabled={!canWrite}
          />
        </Field>
        <Field label="ساعات کاری" error={errors.workingHours} htmlFor="s-hours">
          <Input id="s-hours" value={form.workingHours} onChange={set('workingHours')} disabled={!canWrite} />
        </Field>
        <Field label="نوار اعلان بالای سایت" error={errors.announcement} htmlFor="s-announcement">
          <Input
            id="s-announcement"
            value={form.announcement}
            onChange={set('announcement')}
            disabled={!canWrite}
          />
        </Field>
        <Field
          label="موبایل پشتیبانی"
          error={errors.supportMobile}
          htmlFor="s-support-mobile"
          hint="اختیاری؛ در صفحهٔ تماس با ما نمایش داده می‌شود."
        >
          <Input
            id="s-support-mobile"
            dir="ltr"
            inputMode="tel"
            className="font-display"
            value={form.supportMobile ?? ''}
            onChange={setOptional('supportMobile')}
            disabled={!canWrite}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="اینستاگرام"
            error={errors.instagram}
            htmlFor="s-instagram"
            hint="فقط نام کاربری، بدون @"
          >
            <Input
              id="s-instagram"
              dir="ltr"
              className="font-display"
              value={form.instagram ?? ''}
              onChange={setOptional('instagram')}
              disabled={!canWrite}
            />
          </Field>
          <Field label="تلگرام" error={errors.telegram} htmlFor="s-telegram" hint="فقط نام کاربری، بدون @">
            <Input
              id="s-telegram"
              dir="ltr"
              className="font-display"
              value={form.telegram ?? ''}
              onChange={setOptional('telegram')}
              disabled={!canWrite}
            />
          </Field>
        </div>

        <h3 className="mt-2 border-t border-line pt-4 text-sm font-semibold text-ink">قوانین و اعتماد</h3>
        <Field
          label="نام فروشنده (حقیقی یا حقوقی)"
          error={errors.legalName}
          htmlFor="s-legal-name"
          hint="در صفحهٔ قوانین و مقررات به‌عنوان طرف قرارداد نوشته می‌شود؛ اگر خالی باشد نام فروشگاه استفاده می‌شود."
        >
          <Input id="s-legal-name" value={form.legalName} onChange={set('legalName')} disabled={!canWrite} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="گارانتی فروشگاه (ماه)"
            error={errors.warrantyMonths}
            htmlFor="s-warranty"
            hint="همهٔ ادعاهای گارانتی سایت از این عدد می‌آیند؛ ۰ یعنی گارانتی فروشگاه ندارد."
          >
            <Input
              id="s-warranty"
              dir="ltr"
              inputMode="numeric"
              className="font-display"
              value={String(form.warrantyMonths)}
              onChange={setNumber('warrantyMonths')}
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="مهلت بازگشت کالا (روز)"
            error={errors.returnDays}
            htmlFor="s-returns"
            hint="برای دستگاه پلمپ و سالم، از روز تحویل؛ ۰ یعنی بازگشت ندارد."
          >
            <Input
              id="s-returns"
              dir="ltr"
              inputMode="numeric"
              className="font-display"
              value={String(form.returnDays)}
              onChange={setNumber('returnDays')}
              disabled={!canWrite}
            />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="شناسهٔ نماد اعتماد (id)"
            error={errors.enamadId}
            htmlFor="s-enamad-id"
            hint="از کد نماد در پنل enamad.ir: عدد بعد از id="
          >
            <Input
              id="s-enamad-id"
              dir="ltr"
              className="font-display"
              value={form.enamadId ?? ''}
              onChange={setOptional('enamadId')}
              disabled={!canWrite}
            />
          </Field>
          <Field
            label="کد نماد اعتماد (Code)"
            error={errors.enamadCode}
            htmlFor="s-enamad-code"
            hint="مقدار بعد از Code="
          >
            <Input
              id="s-enamad-code"
              dir="ltr"
              className="font-display"
              value={form.enamadCode ?? ''}
              onChange={setOptional('enamadCode')}
              disabled={!canWrite}
            />
          </Field>
        </div>

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره تنظیمات فروشگاه
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

function HomeForm({ value, canWrite }: { value: HomeSettings; canWrite: boolean }) {
  const { save, errors, pending } = useSave('home');
  const [banners, setBanners] = useState(value.heroBanners);
  const [categories, setCategories] = useState(value.categorySlugs.join(', '));

  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            heroBanners: banners,
            categorySlugs: categories
              .split(',')
              .map((slug) => slug.trim())
              .filter(Boolean),
          });
        }}
      >
        {banners.map((banner, index) => (
          <div key={banner.id} className="grid gap-3 rounded-2xl border border-line p-4">
            <p className="text-[13px] font-medium text-ink">بنر {formatNumberFa(index + 1)}</p>
            <Field label="عنوان" htmlFor={`banner-title-${banner.id}`}>
              <Input
                id={`banner-title-${banner.id}`}
                value={banner.title}
                disabled={!canWrite}
                onChange={(event) =>
                  setBanners((list) =>
                    list.map((item, i) => (i === index ? { ...item, title: event.target.value } : item)),
                  )
                }
              />
            </Field>
            <Field label="زیرعنوان" htmlFor={`banner-subtitle-${banner.id}`}>
              <Textarea
                id={`banner-subtitle-${banner.id}`}
                rows={2}
                value={banner.subtitle}
                disabled={!canWrite}
                onChange={(event) =>
                  setBanners((list) =>
                    list.map((item, i) => (i === index ? { ...item, subtitle: event.target.value } : item)),
                  )
                }
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="slug محصول" htmlFor={`banner-slug-${banner.id}`}>
                <Input
                  id={`banner-slug-${banner.id}`}
                  dir="ltr"
                  className="font-display"
                  value={banner.productSlug}
                  disabled={!canWrite}
                  onChange={(event) =>
                    setBanners((list) =>
                      list.map((item, i) =>
                        i === index ? { ...item, productSlug: event.target.value } : item,
                      ),
                    )
                  }
                />
              </Field>
              <Field label="کد رنگ" htmlFor={`banner-color-${banner.id}`}>
                <Input
                  id={`banner-color-${banner.id}`}
                  dir="ltr"
                  className="font-display"
                  value={banner.colorCode ?? ''}
                  disabled={!canWrite}
                  onChange={(event) =>
                    setBanners((list) =>
                      list.map((item, i) =>
                        i === index ? { ...item, colorCode: event.target.value || null } : item,
                      ),
                    )
                  }
                />
              </Field>
            </div>
          </div>
        ))}

        <Field
          label="مدل‌های بخش دسته‌بندی"
          error={errors.categorySlugs}
          htmlFor="home-categories"
          hint="slugها را با کاما جدا کن."
        >
          <Input
            id="home-categories"
            dir="ltr"
            className="font-display"
            value={categories}
            disabled={!canWrite}
            onChange={(event) => setCategories(event.target.value)}
          />
        </Field>

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره صفحه اصلی
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

const CONNECTION_BADGE: Record<
  PaymentConnectionDto['state'],
  { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral' | 'outline' }
> = {
  LIVE: { label: 'وصل', tone: 'success' },
  TEST: { label: 'کلید تست، فقط کارکنان', tone: 'warning' },
  MOCK: { label: 'شبیه‌ساز (فقط توسعه)', tone: 'neutral' },
  INCOMPLETE: { label: 'تنظیم ناقص', tone: 'danger' },
  OFF: { label: 'وصل نیست', tone: 'outline' },
};

function PaymentsForm({
  value,
  connections,
  canWrite,
}: {
  value: PaymentSettings;
  connections: PaymentConnectionDto[];
  canWrite: boolean;
}) {
  const { save, pending } = useSave('payments');
  const [disabled, setDisabled] = useState<PaymentMethod[]>(value.disabledMethods);
  const [terms, setTerms] = useState(value.installmentTerms);

  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ disabledMethods: disabled, installmentTerms: terms });
        }}
      >
        <div>
          <p className="mb-2 text-[13px] font-medium text-ink">روش‌های پرداخت فعال</p>
          <div className="grid gap-2.5 rounded-2xl border border-line p-4">
            {PAYMENT_METHODS.map((method) => {
              const connection = connections.find((item) => item.method === method);
              const badge = connection ? CONNECTION_BADGE[connection.state] : null;
              return (
                <div key={method} className="grid gap-1">
                  <div className="flex flex-wrap items-center gap-2.5 text-[13px] text-ink-muted">
                    <label className="flex items-center gap-2.5">
                      <Checkbox
                        checked={!disabled.includes(method)}
                        disabled={!canWrite}
                        onCheckedChange={(checked) =>
                          setDisabled((list) =>
                            checked ? list.filter((item) => item !== method) : [...list, method],
                          )
                        }
                      />
                      {PAYMENT_METHOD_INFO[method].name}
                    </label>
                    {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
                  </div>
                  {connection?.state === 'INCOMPLETE' && connection.detail ? (
                    <p className="pe-7 text-end text-[11px] leading-5 text-danger" dir="ltr">
                      {connection.detail}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] leading-6 text-muted">
            روشی که وصل نیست، حتی با تیک، در سایت نمایش داده نمی‌شود. زرین‌پال با{' '}
            <span dir="ltr">go-live.sh</span> و اسنپ‌پی، تارا، دیجی‌پی، باجت و ازکی‌وام با{' '}
            <span dir="ltr">installments.sh</span> روی سرور وصل می‌شوند (نسیبا هنوز API پذیرندگی منتشر نکرده
            است). سرویسی که با کلید تست وصل است فقط به کسی نشان داده می‌شود که در سایت با موبایل یک مدیر وارد
            شده باشد.
          </p>
        </div>

        <div className="grid gap-3">
          <p className="text-[13px] font-medium text-ink">شرایط اقساط</p>
          {INSTALLMENT_METHODS.map((method) => {
            const index = terms.findIndex((term) => term.method === method);
            const term = terms[index];
            if (!term) return null;
            return (
              <div key={method} className="grid gap-3 rounded-2xl border border-line p-4 sm:grid-cols-3">
                <p className="text-[13px] font-medium text-ink sm:col-span-3">
                  {PAYMENT_METHOD_INFO[method].name}
                </p>
                <Field label="حداقل پیش‌پرداخت (٪)" htmlFor={`down-${method}`}>
                  <Input
                    id={`down-${method}`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={String(term.minDownPaymentPercent)}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setTerms((list) =>
                        list.map((item, i) =>
                          i === index
                            ? { ...item, minDownPaymentPercent: Number(event.target.value) || 0 }
                            : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="حداکثر اقساط" htmlFor={`months-${method}`}>
                  <Input
                    id={`months-${method}`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={String(term.maxInstallments)}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setTerms((list) =>
                        list.map((item, i) =>
                          i === index ? { ...item, maxInstallments: Number(event.target.value) || 1 } : item,
                        ),
                      )
                    }
                  />
                </Field>
                <Field label="سقف اعتبار (تومان)" htmlFor={`credit-${method}`}>
                  <Input
                    id={`credit-${method}`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={String(term.maxCredit)}
                    disabled={!canWrite}
                    onChange={(event) =>
                      setTerms((list) =>
                        list.map((item, i) =>
                          i === index ? { ...item, maxCredit: Number(event.target.value) || 0 } : item,
                        ),
                      )
                    }
                  />
                </Field>
              </div>
            );
          })}
        </div>

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره تنظیمات پرداخت
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

function CommerceForm({ value, canWrite }: { value: CommerceSettings; canWrite: boolean }) {
  const { save, errors, pending } = useSave('commerce');
  const [freeShipping, setFreeShipping] = useState(String(value.freeShippingThreshold ?? ''));
  const [maxQty, setMaxQty] = useState(String(value.maxQtyPerItem));

  return (
    <Panel>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            freeShippingThreshold: freeShipping ? Number(freeShipping) : null,
            maxQtyPerItem: Number(maxQty),
          });
        }}
      >
        <Field
          label="آستانه ارسال رایگان (تومان)"
          error={errors.freeShippingThreshold}
          htmlFor="free-shipping"
          hint="خالی یعنی ارسال رایگان غیرفعال است."
        >
          <Input
            id="free-shipping"
            inputMode="numeric"
            dir="ltr"
            className="font-display"
            value={freeShipping}
            disabled={!canWrite}
            onChange={(event) => setFreeShipping(event.target.value)}
          />
        </Field>
        <Field label="حداکثر تعداد هر کالا در سبد" error={errors.maxQtyPerItem} htmlFor="max-qty">
          <Input
            id="max-qty"
            inputMode="numeric"
            dir="ltr"
            className="font-display"
            value={maxQty}
            disabled={!canWrite}
            onChange={(event) => setMaxQty(event.target.value)}
          />
        </Field>

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره تنظیمات سبد
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

const SAMPLE_TERMS = [
  'خریدار متعهد است هر قسط را تا سررسید آن در جدول بالا بپردازد.',
  'در صورت برگشت خوردن هر چک یا تأخیر بیش از ۱۵ روز در پرداخت یک قسط، فروشنده می‌تواند همهٔ مانده را یک‌جا مطالبه کند.',
  'چک‌ها و سفته‌های تضمین پس از تسویهٔ کامل به خریدار بازگردانده می‌شود.',
  'گارانتی و خدمات پس از فروش مطابق فاکتور فروش است و به پرداخت اقساط بستگی ندارد.',
  'ضامن با امضای این قرارداد، پرداخت اقساط را همراه با خریدار تعهد می‌کند.',
].join('\n');

/** «تنظیمات ← دفتر اقساط»: the reminder SMS and the clauses printed under every contract. */
function LedgerForm({
  value,
  remindersReady,
  canWrite,
}: {
  value: LedgerSettings;
  remindersReady: boolean | null;
  canWrite: boolean;
}) {
  const { save, errors, pending } = useSave('ledger');
  const [enabled, setEnabled] = useState(value.remindersEnabled);
  const [before, setBefore] = useState(String(value.remindDaysBefore));
  const [every, setEvery] = useState(String(value.overdueEveryDays));
  const [terms, setTerms] = useState(value.contractTerms);

  return (
    <Panel>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            remindersEnabled: enabled,
            remindDaysBefore: Number(before),
            overdueEveryDays: Number(every),
            contractTerms: terms,
          });
        }}
      >
        <h2 className="text-[15px] font-semibold text-ink">پیامک یادآوری قسط</h2>
        {remindersReady === false ? (
          <p className="rounded-2xl bg-warning-soft px-4 py-3 text-[12px] leading-6 text-warning">
            الگوی پیامک یادآوری هنوز روی سرور نیست: در کنسول ملی‌پیامک الگوی «یادآوری قسط قرارداد {'{0}'} به
            مبلغ {'{1}'} تومان با سررسید {'{2}'}» را بساز و بعد از تأیید، کدش را با deploy/alerts.sh روی سرور
            وارد کن. تا آن موقع یادآوری فرستاده نمی‌شود.
          </p>
        ) : null}
        <label className="flex items-center gap-3 text-[13px] text-ink">
          <Checkbox
            checked={enabled}
            disabled={!canWrite}
            onCheckedChange={(checked) => setEnabled(checked === true)}
          />
          هر روز ساعت ۱۰ صبح برای قسط‌های نزدیک و معوق پیامک یادآوری فرستاده شود
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="چند روز پیش از سررسید"
            error={errors.remindDaysBefore}
            htmlFor="remind-before"
            hint="۰ یعنی روز سررسید"
          >
            <Input
              id="remind-before"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={before}
              disabled={!canWrite}
              onChange={(event) => setBefore(event.target.value)}
            />
          </Field>
          <Field
            label="یادآوری دوباره برای معوق، هر چند روز"
            error={errors.overdueEveryDays}
            htmlFor="remind-every"
            hint="۰ یعنی برای معوق پیامک نرود"
          >
            <Input
              id="remind-every"
              inputMode="numeric"
              dir="ltr"
              className="font-display"
              value={every}
              disabled={!canWrite}
              onChange={(event) => setEvery(event.target.value)}
            />
          </Field>
        </div>

        <h2 className="mt-2 text-[15px] font-semibold text-ink">شرایط قرارداد</h2>
        <Field
          label="بندهای قرارداد (هر خط یک بند)"
          error={errors.contractTerms}
          htmlFor="contract-terms"
          hint="زیر هر قرارداد چاپی می‌آید. متن نمونه فقط نقطهٔ شروع است؛ آن را با مشاور حقوقی خودت بازبینی کن."
        >
          <Textarea
            id="contract-terms"
            rows={8}
            maxLength={4000}
            value={terms}
            disabled={!canWrite}
            onChange={(event) => setTerms(event.target.value)}
          />
        </Field>
        {canWrite && !terms.trim() ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="justify-self-start"
            onClick={() => setTerms(SAMPLE_TERMS)}
          >
            درج متن نمونه
          </Button>
        ) : null}

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره تنظیمات دفتر اقساط
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

/** The addresses the owner registers in the search consoles and price-comparison sites. */
function SiteAddresses() {
  const rows = [
    { label: 'نقشهٔ سایت (بخش Sitemaps در سرچ کنسول و Bing)', url: absoluteUrl('/sitemap.xml') },
    { label: 'فایل robots', url: absoluteUrl('/robots.txt') },
    {
      label: 'وب‌سرویس محصولات برای ترب (API نسخهٔ ۳؛ برای پشتیبانی ترب بفرست)',
      url: absoluteUrl('/api/feeds/torob'),
    },
    {
      label: 'وب‌سرویس محصولات برای ایمالز (برای پشتیبانی ایمالز بفرست)',
      url: absoluteUrl('/api/feeds/emalls'),
    },
  ];
  return (
    <dl className="grid gap-3 rounded-2xl bg-surface-2 p-4 text-[12px]">
      {rows.map((row) => (
        <div key={row.url}>
          <dt className="text-muted">{row.label}</dt>
          <dd dir="ltr" className="mt-1 select-all break-all text-end font-display text-ink">
            {row.url}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function SeoForm({ value, canWrite }: { value: SeoSettings; canWrite: boolean }) {
  const { save, errors, pending } = useSave('seo');
  const [form, setForm] = useState(value);
  // a blank field is «not set»; the API also accepts the whole <meta> tag
  const set = (key: keyof SeoSettings) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setForm((state) => ({ ...state, [key]: event.target.value.trim() ? event.target.value : null }));

  return (
    <Panel>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void save(form);
        }}
      >
        <p className="text-[12px] leading-6 text-muted">
          کدها را از هر کنسول کپی کن؛ کل تگ <span dir="ltr">{'<meta … />'}</span> یا فقط مقدار content را
          می‌توانی بچسبانی. حدود دو دقیقه بعد از ذخیره روی سایت می‌نشیند؛ بعد دکمهٔ «Verify» را در همان کنسول
          بزن.
        </p>
        <Field
          label="کد تأیید Google Search Console"
          error={errors.googleVerification}
          htmlFor="seo-google"
          hint="در سرچ کنسول دامنه را به‌صورت URL prefix اضافه کن و روش «HTML tag» را انتخاب کن."
        >
          <Input
            id="seo-google"
            dir="ltr"
            className="font-display"
            value={form.googleVerification ?? ''}
            onChange={set('googleVerification')}
            disabled={!canWrite}
          />
        </Field>
        <Field
          label="کد تأیید Bing Webmaster (اختیاری)"
          error={errors.bingVerification}
          htmlFor="seo-bing"
          hint="روش «HTML Meta Tag» با نام msvalidate.01. بینگ می‌تواند سایت را از سرچ کنسول گوگل هم وارد کند."
        >
          <Input
            id="seo-bing"
            dir="ltr"
            className="font-display"
            value={form.bingVerification ?? ''}
            onChange={set('bingVerification')}
            disabled={!canWrite}
          />
        </Field>
        <Field
          label="کد تأیید Yandex Webmaster (اختیاری)"
          error={errors.yandexVerification}
          htmlFor="seo-yandex"
          hint="روش «Meta tag» با نام yandex-verification."
        >
          <Input
            id="seo-yandex"
            dir="ltr"
            className="font-display"
            value={form.yandexVerification ?? ''}
            onChange={set('yandexVerification')}
            disabled={!canWrite}
          />
        </Field>

        <h3 className="mt-2 border-t border-line pt-4 text-sm font-semibold text-ink">آمار بازدید</h3>
        <Field
          label="شناسهٔ اندازه‌گیری Google Analytics 4"
          error={errors.ga4MeasurementId}
          htmlFor="seo-ga4"
          hint="در آنالیتیکس: Admin ← Data streams ← Web؛ مثل G-AB12CD34EF. بازدید، افزودن به سبد، شروع تسویه و خرید موفق ثبت می‌شود؛ خالی یعنی آنالیتیکس خاموش است."
        >
          <Input
            id="seo-ga4"
            dir="ltr"
            className="font-display"
            value={form.ga4MeasurementId ?? ''}
            onChange={set('ga4MeasurementId')}
            disabled={!canWrite}
          />
        </Field>

        <h3 className="mt-2 border-t border-line pt-4 text-sm font-semibold text-ink">
          آدرس‌های ثبت در کنسول‌ها، ترب و ایمالز
        </h3>
        <SiteAddresses />

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره تنظیمات سئو
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

// ─── instalments with a cheque or promissory note ────────────────────────────

type PlanKey = 'cheque' | 'safte';
const PLAN_LABELS: Record<PlanKey, string> = { cheque: 'چک صیادی', safte: 'سفته' };
/** Figures are edited as text, so a field can be left blank and Persian digits typed. */
type PlanDraft = Omit<
  CreditPlan,
  'minDownPaymentPercent' | 'maxMonths' | 'monthlyFeePercent' | 'maxFinanced'
> & {
  minDownPaymentPercent: string;
  maxMonths: string;
  monthlyFeePercent: string;
  maxFinanced: string;
};
const SAMPLE_PRICE = 100_000_000;

function toDraft(plan: CreditPlan): PlanDraft {
  const text = (value: number | null) => (value === null ? '' : String(value));
  return {
    ...plan,
    minDownPaymentPercent: text(plan.minDownPaymentPercent),
    maxMonths: text(plan.maxMonths),
    monthlyFeePercent: text(plan.monthlyFeePercent),
    maxFinanced: text(plan.maxFinanced),
  };
}

/** Best-effort read of a draft for the live example; the API has the final word. */
function draftNumber(value: string): number | null {
  const latin = value.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[,٬،\s]/g, '');
  if (latin === '') return null;
  const number = Number(latin.replace('٫', '.'));
  return Number.isFinite(number) ? number : null;
}

function CreditForm({ value, canWrite }: { value: CreditSettings; canWrite: boolean }) {
  const { save, errors, pending } = useSave('credit');
  const [plans, setPlans] = useState<Record<PlanKey, PlanDraft>>({
    cheque: toDraft(value.cheque),
    safte: toDraft(value.safte),
  });
  const [approvalTime, setApprovalTime] = useState(value.approvalTime);
  const update = (key: PlanKey, patch: Partial<PlanDraft>) =>
    setPlans((state) => ({ ...state, [key]: { ...state[key], ...patch } }));

  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save({ cheque: plans.cheque, safte: plans.safte, approvalTime });
        }}
      >
        <p className="text-[12px] leading-6 text-muted">
          شرایط خرید قسطی مستقیم فروشگاه. هر عددی را که خالی بگذاری، صفحه‌های «آیفون قسطی»، «خرید گوشی با چک»
          و «خرید آیفون با سفته» بدون آن عدد توضیح می‌دهند. وقتی پیش‌پرداخت، تعداد اقساط و کارمزد ماهانه پر
          باشند، محاسبه‌گر و جدول قسط هر مدل خودکار ظاهر می‌شود.
        </p>

        {(Object.keys(PLAN_LABELS) as PlanKey[]).map((key) => {
          const plan = plans[key];
          const fieldError = (name: string) => errors[`${key}.${name}`];
          const ready = {
            ...plan,
            minDownPaymentPercent: draftNumber(plan.minDownPaymentPercent),
            maxMonths: draftNumber(plan.maxMonths),
            monthlyFeePercent: draftNumber(plan.monthlyFeePercent),
            maxFinanced: draftNumber(plan.maxFinanced),
          };
          const sample = creditPlanReady(ready) ? estimateCreditPlan(SAMPLE_PRICE, ready) : null;
          return (
            <fieldset key={key} className="grid gap-4 rounded-2xl border border-line p-4">
              <legend className="px-1 text-[14px] font-semibold text-ink">خرید با {PLAN_LABELS[key]}</legend>
              <label className="flex items-center gap-2.5 text-[13px] text-ink-muted">
                <Checkbox
                  checked={plan.enabled}
                  disabled={!canWrite}
                  onCheckedChange={(checked) => update(key, { enabled: checked === true })}
                />
                این روش را ارائه می‌دهیم
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="حداقل پیش‌پرداخت (٪)"
                  htmlFor={`${key}-down`}
                  error={fieldError('minDownPaymentPercent')}
                >
                  <Input
                    id={`${key}-down`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={plan.minDownPaymentPercent}
                    disabled={!canWrite}
                    onChange={(event) => update(key, { minDownPaymentPercent: event.target.value })}
                  />
                </Field>
                <Field
                  label="حداکثر تعداد اقساط (ماه)"
                  htmlFor={`${key}-months`}
                  error={fieldError('maxMonths')}
                >
                  <Input
                    id={`${key}-months`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={plan.maxMonths}
                    disabled={!canWrite}
                    onChange={(event) => update(key, { maxMonths: event.target.value })}
                  />
                </Field>
                <Field
                  label="کارمزد ماهانه (٪)"
                  htmlFor={`${key}-fee`}
                  error={fieldError('monthlyFeePercent')}
                  hint="ثابت، روی مبلغ باقی‌مانده پس از پیش‌پرداخت؛ ۴ یعنی ماهی ۴٪. بدون کارمزد: ۰"
                >
                  <Input
                    id={`${key}-fee`}
                    inputMode="decimal"
                    dir="ltr"
                    className="font-display"
                    value={plan.monthlyFeePercent}
                    disabled={!canWrite}
                    onChange={(event) => update(key, { monthlyFeePercent: event.target.value })}
                  />
                </Field>
                <Field
                  label="سقف مبلغ اقساط (تومان)"
                  htmlFor={`${key}-max`}
                  error={fieldError('maxFinanced')}
                  hint="اختیاری؛ اگر مانده از سقف بیشتر شود، پیش‌پرداخت بالا می‌رود."
                >
                  <Input
                    id={`${key}-max`}
                    inputMode="numeric"
                    dir="ltr"
                    className="font-display"
                    value={plan.maxFinanced}
                    disabled={!canWrite}
                    onChange={(event) => update(key, { maxFinanced: event.target.value })}
                  />
                </Field>
              </div>
              <Field
                label="مدارک لازم"
                htmlFor={`${key}-docs`}
                error={fieldError('documents')}
                hint="هر مدرک در یک خط؛ روی صفحه به‌صورت فهرست نمایش داده می‌شود."
              >
                <Textarea
                  id={`${key}-docs`}
                  rows={4}
                  value={plan.documents}
                  disabled={!canWrite}
                  onChange={(event) => update(key, { documents: event.target.value })}
                />
              </Field>
              <Field
                label="ضامن"
                htmlFor={`${key}-guarantor`}
                error={fieldError('guarantor')}
                hint="مثلاً «بدون ضامن» یا «یک ضامن کارمند رسمی با گواهی کسر از حقوق»؛ خالی یعنی روی صفحه گفته نمی‌شود."
              >
                <Input
                  id={`${key}-guarantor`}
                  value={plan.guarantor}
                  disabled={!canWrite}
                  onChange={(event) => update(key, { guarantor: event.target.value })}
                />
              </Field>
              <Field label="توضیح بیشتر" htmlFor={`${key}-notes`} error={fieldError('notes')}>
                <Textarea
                  id={`${key}-notes`}
                  rows={2}
                  value={plan.notes}
                  disabled={!canWrite}
                  onChange={(event) => update(key, { notes: event.target.value })}
                />
              </Field>
              <p className="rounded-xl bg-surface-2 px-3 py-2.5 text-[12px] leading-6 text-muted">
                {sample
                  ? `نمونه برای گوشی ${formatToman(SAMPLE_PRICE)}: پیش‌پرداخت ${formatToman(sample.downPayment)} و ${formatNumberFa(sample.months)} قسط ماهانهٔ ${formatToman(sample.monthly)}؛ جمع کل ${formatToman(sample.totalCost)}.`
                  : 'تا پیش‌پرداخت، تعداد اقساط و کارمزد ماهانه پر نشده، محاسبه‌گر این روش روی سایت نمایش داده نمی‌شود.'}
              </p>
            </fieldset>
          );
        })}

        <Field
          label="زمان بررسی تا قرارداد"
          htmlFor="credit-approval"
          error={errors.approvalTime}
          hint="مثلاً «کمتر از ۲۴ ساعت کاری»؛ خالی یعنی روی صفحه گفته نمی‌شود."
        >
          <Input
            id="credit-approval"
            value={approvalTime}
            disabled={!canWrite}
            onChange={(event) => setApprovalTime(event.target.value)}
          />
        </Field>

        {canWrite ? (
          <Button type="submit" size="md" loading={pending}>
            ذخیره شرایط چک و سفته
          </Button>
        ) : null}
      </form>
    </Panel>
  );
}

const ALERTS_SCRIPT = 'bash /home/iphoneha/app/deploy/alerts.sh';
const BOT_NAMES = { telegram: 'تلگرام', bale: 'بله' } as const;

function ScriptHint() {
  return (
    <>
      <code
        dir="ltr"
        className="my-1 block w-fit max-w-full overflow-x-auto whitespace-nowrap rounded-lg bg-canvas px-2 py-1 font-mono text-[11px] text-ink"
      >
        {ALERTS_SCRIPT}
      </code>
    </>
  );
}

function SmsStatus({ status }: { status: AlertStatusDto['sms'] }) {
  if (status.driver === 'console') {
    return <>سرویس پیامک هنوز وصل نشده (go-live.sh)؛ تا آن موقع هشدارها فقط در گزارش سرور نوشته می‌شوند.</>;
  }
  if (status.driver !== 'melipayamak') return <>پیامک‌ها از سرویس پیامک فروشگاه فرستاده می‌شوند.</>;
  const missing = [
    status.ready['credit-request'] ? null : 'درخواست تازه',
    status.ready['order-paid'] ? null : 'سفارش پرداخت‌شده',
  ].filter(Boolean);
  if (missing.length === 0) return <>ملی‌پیامک؛ الگوی هر دو هشدار روی سرور ثبت شده است.</>;
  return (
    <>
      ملی‌پیامک فقط متن‌های تأییدشده (الگو) را می‌فرستد و الگوی «{missing.join('» و «')}» هنوز روی سرور ثبت
      نشده. متن پیشنهادی الگو و ثبت شمارهٔ آن با این دستور روی سرور: <ScriptHint />
    </>
  );
}

function AlertsForm({
  value,
  status,
  canWrite,
}: {
  value: AlertSettings;
  status: AlertStatusDto | null;
  canWrite: boolean;
}) {
  const { save, errors, pending } = useSave('alerts');
  const [mobiles, setMobiles] = useState(() => [0, 1, 2].map((index) => value.mobiles[index] ?? ''));
  const [creditRequests, setCreditRequests] = useState(value.creditRequests);
  const [paidOrders, setPaidOrders] = useState(value.paidOrders);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<AlertTestResultDto | null>(null);

  async function sendTest() {
    setTesting(true);
    setResult(null);
    try {
      setResult(await api.post<AlertTestResultDto>('/admin/alerts/test'));
    } catch (cause) {
      toast.error(errorMessage(cause));
    } finally {
      setTesting(false);
    }
  }

  return (
    <Panel>
      <form
        className="grid gap-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save({
            mobiles: mobiles.map((mobile) => mobile.trim()).filter(Boolean),
            creditRequests,
            paidOrders,
          });
        }}
      >
        <p className="text-[12px] leading-6 text-muted">
          وقتی کسی فرم «خرید قسطی با چک یا سفته» را می‌فرستد یا سفارشی پرداخت می‌شود، فروشگاه با پیامک و ربات
          تلگرام یا بله خبرت می‌کند. در پیامک و ربات فقط شماره، روش پرداخت، مدل و مبلغ می‌آید؛ نام و موبایل
          مشتری فقط در پنل است.
        </p>

        <fieldset className="grid gap-3">
          <legend className="mb-1 text-[13px] font-semibold text-ink">خبرم کن وقتی</legend>
          <label className="flex items-center gap-2.5 text-[13px] text-ink-muted">
            <Checkbox
              checked={creditRequests}
              disabled={!canWrite}
              onCheckedChange={(checked) => setCreditRequests(checked === true)}
            />
            درخواست تازهٔ خرید قسطی با چک یا سفته می‌رسد
          </label>
          <label className="flex items-center gap-2.5 text-[13px] text-ink-muted">
            <Checkbox
              checked={paidOrders}
              disabled={!canWrite}
              onCheckedChange={(checked) => setPaidOrders(checked === true)}
            />
            سفارشی پرداخت می‌شود (درگاه یا سرویس اقساطی)
          </label>
        </fieldset>

        <Field
          label="موبایل‌هایی که پیامک هشدار می‌گیرند"
          error={errors.mobiles ?? errors['mobiles.0'] ?? errors['mobiles.1'] ?? errors['mobiles.2']}
          hint="تا سه شماره؛ خالی بگذاری، پیامک به موبایل مدیر اصلی فروشگاه می‌رود."
        >
          <div className="grid gap-2 sm:grid-cols-3">
            {mobiles.map((mobile, index) => (
              <Input
                key={index}
                aria-label={`موبایل ${formatNumberFa(index + 1)}`}
                aria-invalid={Boolean(errors[`mobiles.${index}`]) || undefined}
                inputMode="tel"
                dir="ltr"
                placeholder="09xxxxxxxxx"
                className="font-display"
                value={mobile}
                disabled={!canWrite}
                onChange={(event) =>
                  setMobiles((list) => list.map((item, at) => (at === index ? event.target.value : item)))
                }
              />
            ))}
          </div>
        </Field>

        <div className="grid gap-3 rounded-2xl border border-line bg-surface-2 px-4 py-3.5 text-[12px] leading-6 text-muted">
          {status ? (
            <>
              <p>
                <span className="font-semibold text-ink">پیامک: </span>
                <SmsStatus status={status.sms} />
                {status.sms.recipients.length > 0 ? (
                  <>
                    {' '}
                    گیرنده:{' '}
                    <span dir="ltr" className="font-display text-ink">
                      {status.sms.recipients.join('، ')}
                    </span>
                  </>
                ) : null}
              </p>
              <p>
                <span className="font-semibold text-ink">ربات: </span>
                {status.bot.service ? (
                  <>ربات {BOT_NAMES[status.bot.service]} وصل است؛ هشدارها در همان گفتگو یا گروه می‌آیند.</>
                ) : (
                  <>
                    وصل نیست. برای هشدار در تلگرام یا بله یک ربات بساز و این دستور را روی سرور اجرا کن:{' '}
                    <ScriptHint />
                    توکن ربات فقط همان‌جا، روی سرور، وارد می‌شود.
                  </>
                )}
              </p>
            </>
          ) : (
            <p>وضعیت پیامک و ربات خوانده نشد؛ صفحه را دوباره باز کن.</p>
          )}
          <div className="grid gap-1.5">
            <p>
              <span className="font-semibold text-ink">مرورگر: </span>
              پنل باز هر دقیقه درخواست تازه را بررسی می‌کند و با پیام کوچک پایین صفحه خبر می‌دهد.
            </p>
            <BrowserAlertsToggle />
          </div>
        </div>

        {canWrite ? (
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" size="md" loading={pending}>
              ذخیره هشدارها
            </Button>
            <Button type="button" variant="outline" size="md" loading={testing} onClick={sendTest}>
              فرستادن پیام آزمایشی
            </Button>
          </div>
        ) : null}

        {result ? <AlertTestResult result={result} /> : null}
      </form>
    </Panel>
  );
}

function Line({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      {ok ? (
        <Check className="mt-1 size-3.5 shrink-0 text-success" aria-label="فرستاده شد" />
      ) : (
        <X className="mt-1 size-3.5 shrink-0 text-danger" aria-label="فرستاده نشد" />
      )}
      <span>{children}</span>
    </li>
  );
}

function AlertTestResult({ result }: { result: AlertTestResultDto }) {
  return (
    <ul className="grid gap-1.5 text-[12px] leading-6 text-ink-muted" aria-live="polite">
      {result.sms.length === 0 ? (
        <Line ok={false}>پیامکی فرستاده نشد: الگوی پیامک هشدار روی سرور ثبت نشده است.</Line>
      ) : (
        result.sms.map((sms) => (
          <Line key={sms.phone} ok={sms.ok}>
            پیامک به{' '}
            <span dir="ltr" className="font-display">
              {sms.phone}
            </span>
            {sms.error ? ` — ${sms.error}` : ' فرستاده شد؛ چند ثانیهٔ دیگر برسد.'}
          </Line>
        ))
      )}
      {result.bot ? (
        <Line ok={result.bot.ok}>
          ربات{result.bot.error ? ` — ${result.bot.error}` : ': پیام آزمایشی فرستاده شد.'}
        </Line>
      ) : (
        <Line ok={false}>ربات وصل نیست.</Line>
      )}
    </ul>
  );
}
