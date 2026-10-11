import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowRight, EyeOff } from 'lucide-react';
import { SHIPPING_TIME_LABELS, formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, getAdminProduct, getColors, getStorages } from '@/lib/api/admin';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Table, Td, Th } from '@/components/admin/ui';
import { ProductImage } from '@/components/store/product-image';
import { ConfirmDelete } from '@/components/admin/confirm-delete';
import { ImageUploader } from '@/components/admin/image-uploader';
import { ProductSettingsForm } from '@/components/admin/product-settings-form';
import { VariantCreateDialog } from '@/components/admin/variant-create-dialog';
import { VariantEditor } from '@/components/admin/variant-editor';

export default async function AdminProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [product, admin] = await Promise.all([getAdminProduct(id), getAdminMe()]);
  if (!product) notFound();

  const canWrite = admin?.permissions.includes('products.write') ?? false;
  const [colors, storages] = canWrite ? await Promise.all([getColors(), getStorages()]) : [[], []];
  const unpriced = product.variants.filter((variant) => variant.price <= 0).length;
  const colorNames = new Map(product.variants.map((variant) => [variant.color.id, variant.color.name]));
  const colorName = (colorId: string | null) =>
    colorId ? (colorNames.get(colorId) ?? 'رنگ دیگر') : 'همهٔ رنگ‌ها';
  const neverPriced = product.variants.length > 0 && unpriced === product.variants.length;

  return (
    <div>
      <Link
        href="/admin/products"
        className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-muted hover:text-ink"
      >
        <ArrowRight className="size-4" aria-hidden />
        بازگشت به محصولات
      </Link>

      <PageHeader
        title={product.name}
        description={`${product.nameEn} · ${product.slug}`}
        action={
          <div className="flex gap-2">
            {neverPriced ? (
              <Badge tone="warning">پنهان تا قیمت‌گذاری</Badge>
            ) : (
              <Badge tone={product.isActive ? 'success' : 'neutral'}>
                {product.isActive ? 'فعال' : 'غیرفعال'}
              </Badge>
            )}
            {product.isFeatured ? <Badge tone="info">ویژه</Badge> : null}
            <Link
              href={`/iphone/${product.slug}`}
              className="rounded-pill border border-line px-3 py-1.5 text-[12px] text-ink-muted hover:bg-surface"
            >
              مشاهده در فروشگاه
            </Link>
            {canWrite ? (
              <ConfirmDelete
                path={`/admin/products/${product.id}`}
                title={`حذف ${product.name}`}
                description="محصول و همهٔ ترکیب‌های آن حذف می‌شوند. سفارش‌های ثبت‌شده دست‌نخورده می‌مانند."
                label="حذف محصول"
                redirectTo="/admin/products"
                iconOnly={false}
              />
            ) : null}
          </div>
        }
      />

      {unpriced > 0 ? (
        <div className="mb-4 flex items-start gap-3 rounded-panel border border-warning/25 bg-warning-soft px-4 py-3.5 text-[13px] leading-7 text-ink">
          <EyeOff className="mt-1 size-4 shrink-0 text-warning" aria-hidden />
          <p>
            {neverPriced
              ? 'این مدل هنوز قیمت ندارد و در سایت دیده نمی‌شود. '
              : `${formatNumberFa(unpriced)} ترکیب رنگ و حافظهٔ این مدل قیمت ندارند و در سایت دیده نمی‌شوند. `}
            قیمت فروش هر ترکیبی را که می‌فروشی با دکمهٔ ویرایش همان ردیف وارد کن؛ با ثبت قیمت، آن ترکیب
            {neverPriced ? ' و خود مدل' : ''} خودکار در فروشگاه نمایش داده می‌شود. ترکیب‌هایی را که نمی‌فروشی
            بدون قیمت رها کن.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
        {/* min-w-0: the variants table scrolls inside its column instead of widening the page */}
        <div className="grid min-w-0 gap-4">
          <section className="min-w-0">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">ترکیب‌های رنگ و حافظه</h2>
              {canWrite ? (
                <VariantCreateDialog
                  productId={product.id}
                  productSlug={product.slug}
                  colors={colors}
                  storages={storages}
                />
              ) : null}
            </div>
            <Table>
              <thead>
                <tr>
                  <Th>ترکیب</Th>
                  <Th>SKU</Th>
                  <Th>قیمت</Th>
                  <Th>تخفیف</Th>
                  <Th>موجودی</Th>
                  <Th>ارسال</Th>
                  <Th>وضعیت</Th>
                  {canWrite ? <Th /> : null}
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant) => (
                  <tr key={variant.id}>
                    <Td>
                      <span className="inline-flex items-center gap-2">
                        <span
                          className="size-4 rounded-full"
                          style={{
                            backgroundColor: variant.color.hex,
                            boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.1)',
                          }}
                          aria-hidden
                        />
                        <span className="whitespace-nowrap text-ink">
                          {variant.storage.labelFa} · {variant.color.name}
                        </span>
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap font-display text-[12px]">{variant.sku}</Td>
                    <Td className="tabular whitespace-nowrap">
                      {variant.price > 0 ? (
                        formatToman(variant.price)
                      ) : (
                        <Badge tone="warning">بدون قیمت</Badge>
                      )}
                    </Td>
                    <Td className="tabular whitespace-nowrap">
                      {variant.discountPercent > 0 ? `${formatNumberFa(variant.discountPercent)}٪` : '—'}
                    </Td>
                    <Td className="tabular whitespace-nowrap">
                      {formatNumberFa(variant.availableStock)}
                      <span className="text-[11px] text-muted-faint">
                        {' '}
                        (رزرو {formatNumberFa(variant.reservedStock)})
                      </span>
                    </Td>
                    <Td className="text-[12px]">{SHIPPING_TIME_LABELS[variant.shippingTime]}</Td>
                    <Td>
                      {variant.price > 0 ? (
                        <Badge tone={variant.active ? 'success' : 'neutral'}>
                          {variant.active ? 'فعال' : 'غیرفعال'}
                        </Badge>
                      ) : (
                        <Badge tone="neutral">پنهان</Badge>
                      )}
                    </Td>
                    {canWrite ? (
                      <Td>
                        <div className="flex items-center gap-1">
                          <VariantEditor variant={variant} />
                          <ConfirmDelete
                            path={`/admin/variants/${variant.id}`}
                            title={`حذف ${variant.sku}`}
                            description="این ترکیب از فروشگاه حذف می‌شود. اگر روی آن سفارشی ثبت شده باشد، به‌جای حذف غیرفعال می‌شود."
                          />
                        </div>
                      </Td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </Table>
          </section>

          <section className="rounded-panel border border-line p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[15px] font-semibold text-ink">تصاویر</h2>
              {canWrite ? <ImageUploader productId={product.id} colors={colors} /> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {product.images.map((image) => (
                <figure
                  key={image.id}
                  className="group relative size-24 overflow-hidden rounded-2xl border border-line bg-surface-2"
                >
                  <ProductImage
                    src={image.url}
                    alt={image.alt ?? product.name}
                    sizes="96px"
                    fit={image.kind === 'DETAIL' ? 'cover' : 'contain'}
                    className={image.kind === 'DETAIL' ? undefined : 'p-1'}
                  />
                  <figcaption className="absolute inset-x-1 bottom-1 truncate rounded-pill bg-canvas/90 px-1.5 py-0.5 text-center text-[10px] text-ink-muted backdrop-blur">
                    {colorName(image.colorId)}
                    {image.kind === 'DETAIL' ? ' · نمای نزدیک' : ''}
                  </figcaption>
                  {canWrite ? (
                    <span className="absolute end-1 top-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <ConfirmDelete
                        path={`/admin/images/${image.id}`}
                        title="حذف تصویر"
                        description="این تصویر از گالری محصول حذف می‌شود."
                      />
                    </span>
                  ) : null}
                </figure>
              ))}
              {product.images.length === 0 ? (
                <p className="text-[13px] text-muted">تصویری ثبت نشده است.</p>
              ) : null}
            </div>
          </section>

          <section className="rounded-panel border border-line p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">مشخصات فنی</h2>
            <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
              {product.specs.map((spec) => (
                <div key={spec.key} className="flex justify-between gap-3 border-b border-line py-2">
                  <dt className="text-muted">{spec.key}</dt>
                  <dd className="text-ink-muted">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>

        <div className="grid min-w-0 gap-4">
          {canWrite ? (
            <section className="rounded-panel border border-line p-5">
              <h2 className="mb-4 text-[15px] font-semibold text-ink">تنظیمات محصول</h2>
              <ProductSettingsForm product={product} />
            </section>
          ) : null}

          <section className="rounded-panel border border-line p-5">
            <h2 className="mb-3 text-[15px] font-semibold text-ink">اطلاعات</h2>
            <dl className="grid gap-2.5 text-[13px]">
              <Row label="سری" value={product.series} />
              <Row label="سال عرضه" value={formatNumberFa(product.releaseYear)} />
              <Row label="گارانتی" value={product.warranty} />
              <Row label="قیمت پایه" value={formatToman(product.basePrice)} />
              <Row label="ایجاد" value={formatDateFa(product.createdAt)} />
              <Row label="به‌روزرسانی" value={formatDateFa(product.updatedAt)} />
            </dl>
          </section>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink">{value}</dd>
    </div>
  );
}
