import Link from 'next/link';
import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, listAdminProducts } from '@/lib/api/admin';
import { getCatalogMeta } from '@/lib/api/endpoints';
import { formatDateFa } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { ProductCreateDialog } from '@/components/admin/product-create-dialog';
import { ProductImage } from '@/components/store/product-image';

type SearchParams = Promise<{ q?: string; status?: string; page?: string }>;

export default async function AdminProductsPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [products, admin, meta] = await Promise.all([
    listAdminProducts({
      q: params.q,
      status: params.status ?? 'all',
      page: params.page ?? '1',
      pageSize: '20',
    }),
    getAdminMe(),
    getCatalogMeta(),
  ]);
  const canWrite = admin?.permissions.includes('products.write') ?? false;

  return (
    <div>
      <PageHeader
        title="محصولات"
        description="مدل‌های آیفون، ترکیب‌های رنگ و حافظه و موجودی آن‌ها"
        action={canWrite ? <ProductCreateDialog series={meta.series} /> : undefined}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="نام محصول یا slug…" />
        <div className="flex gap-2">
          {[
            { label: 'همه', value: 'all' },
            { label: 'فعال', value: 'active' },
            { label: 'غیرفعال', value: 'inactive' },
          ].map((option) => (
            <Link
              key={option.value}
              href={`/admin/products?status=${option.value}`}
              className={`rounded-pill border px-3 py-1.5 text-[12px] ${
                (params.status ?? 'all') === option.value
                  ? 'border-ink bg-ink text-white'
                  : 'border-line text-ink-muted hover:bg-surface'
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <Th className="w-16" />
            <Th>محصول</Th>
            <Th>سری</Th>
            <Th>ترکیب‌ها</Th>
            <Th>موجودی</Th>
            <Th>کمترین قیمت</Th>
            <Th>وضعیت</Th>
            <Th>به‌روزرسانی</Th>
          </tr>
        </thead>
        <tbody>
          {products.items.length === 0 ? (
            <EmptyRow colSpan={8} />
          ) : (
            products.items.map((product) => (
              <tr key={product.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <span className="relative block size-12 overflow-hidden rounded-xl bg-surface-2">
                    <ProductImage src={product.image} alt={product.name} sizes="48px" className="p-1" />
                  </span>
                </Td>
                <Td>
                  <Link href={`/admin/products/${product.id}`} className="text-ink hover:underline">
                    {product.name}
                  </Link>
                  <span className="block text-[11px] text-muted font-display">{product.slug}</span>
                </Td>
                <Td className="text-[12px]">{product.series}</Td>
                <Td className="tabular whitespace-nowrap">
                  {formatNumberFa(product.activeVariants)} / {formatNumberFa(product.variantsCount)}
                </Td>
                <Td className="tabular whitespace-nowrap">{formatNumberFa(product.totalAvailable)}</Td>
                <Td className="tabular whitespace-nowrap">
                  {product.minPrice ? formatToman(product.minPrice) : '—'}
                </Td>
                <Td>
                  <div className="flex flex-wrap gap-1.5">
                    {product.unpricedVariants === product.variantsCount && product.variantsCount > 0 ? (
                      // a model the catalogue added: it stays off the site until its first price
                      <Badge tone="warning">پنهان تا قیمت‌گذاری</Badge>
                    ) : (
                      <Badge tone={product.isActive ? 'success' : 'neutral'}>
                        {product.isActive ? 'فعال' : 'غیرفعال'}
                      </Badge>
                    )}
                    {product.unpricedVariants > 0 && product.unpricedVariants < product.variantsCount ? (
                      <Badge tone="warning">{formatNumberFa(product.unpricedVariants)} ترکیب بدون قیمت</Badge>
                    ) : null}
                    {product.isFeatured ? <Badge tone="info">ویژه</Badge> : null}
                  </div>
                </Td>
                <Td className="text-[12px]">{formatDateFa(product.updatedAt)}</Td>
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={products.page}
        totalPages={products.totalPages}
        total={products.total}
        basePath="/admin/products"
        params={params}
      />
    </div>
  );
}
