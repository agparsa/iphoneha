import Link from 'next/link';
import { formatNumberFa, formatToman } from '@iphoneha/shared';
import { getAdminMe, listInventory } from '@/lib/api/admin';
import { Badge } from '@/components/ui/badge';
import { EmptyRow, PageHeader, Table, TablePagination, Td, Th } from '@/components/admin/ui';
import { AdminSearch } from '@/components/admin/admin-search';
import { StockAdjuster } from '@/components/admin/stock-adjuster';

type SearchParams = Promise<{ q?: string; stock?: string; page?: string }>;

const FILTERS = [
  { label: 'همه', value: 'all' },
  { label: 'موجود', value: 'in' },
  { label: 'رو به اتمام', value: 'low' },
  { label: 'ناموجود', value: 'out' },
];

export default async function AdminInventoryPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const [inventory, admin] = await Promise.all([
    listInventory({ q: params.q, stock: params.stock ?? 'all', page: params.page ?? '1', pageSize: '50' }),
    getAdminMe(),
  ]);
  const canWrite = admin?.permissions.includes('inventory.write') ?? false;

  return (
    <div>
      <PageHeader title="انبار" description="موجودی، رزرو و فروش هر ترکیب رنگ و حافظه" />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <AdminSearch placeholder="SKU یا نام محصول…" />
        <div className="flex gap-2">
          {FILTERS.map((filter) => (
            <Link
              key={filter.value}
              href={`/admin/inventory?stock=${filter.value}`}
              className={`rounded-pill border px-3 py-1.5 text-[12px] ${
                (params.stock ?? 'all') === filter.value
                  ? 'border-ink bg-ink text-white'
                  : 'border-line text-ink-muted hover:bg-surface'
              }`}
            >
              {filter.label}
            </Link>
          ))}
        </div>
      </div>

      <Table>
        <thead>
          <tr>
            <Th>محصول</Th>
            <Th>SKU</Th>
            <Th>قیمت</Th>
            <Th>موجودی</Th>
            <Th>رزرو</Th>
            <Th>قابل فروش</Th>
            <Th>فروخته‌شده</Th>
            <Th>وضعیت</Th>
            {canWrite ? <Th /> : null}
          </tr>
        </thead>
        <tbody>
          {inventory.items.length === 0 ? (
            <EmptyRow colSpan={canWrite ? 9 : 8} />
          ) : (
            inventory.items.map((variant) => (
              <tr key={variant.id} className="transition-colors hover:bg-surface-2">
                <Td>
                  <Link href={`/admin/products/${variant.productId}`} className="text-ink hover:underline">
                    {variant.productName}
                  </Link>
                  <span className="block text-[11px] text-muted">
                    {variant.storage.labelFa} · {variant.color.name}
                  </span>
                </Td>
                <Td className="whitespace-nowrap font-display text-[12px]">{variant.sku}</Td>
                <Td className="tabular whitespace-nowrap">{formatToman(variant.price)}</Td>
                <Td className="tabular whitespace-nowrap">
                  {formatNumberFa(variant.stock)}
                  <Link
                    href={`/admin/devices?variantId=${variant.id}`}
                    className="block text-[11px] text-muted hover:text-ink"
                  >
                    IMEIها
                  </Link>
                </Td>
                <Td className="tabular whitespace-nowrap">{formatNumberFa(variant.reservedStock)}</Td>
                <Td className="tabular font-medium text-ink">{formatNumberFa(variant.availableStock)}</Td>
                <Td className="tabular whitespace-nowrap">{formatNumberFa(variant.sold)}</Td>
                <Td>
                  <Badge
                    tone={
                      variant.availableStock === 0
                        ? 'danger'
                        : variant.availableStock <= variant.lowStockThreshold
                          ? 'warning'
                          : 'success'
                    }
                  >
                    {variant.availableStock === 0
                      ? 'ناموجود'
                      : variant.availableStock <= variant.lowStockThreshold
                        ? 'رو به اتمام'
                        : 'موجود'}
                  </Badge>
                </Td>
                {canWrite ? (
                  <Td>
                    <StockAdjuster variant={variant} />
                  </Td>
                ) : null}
              </tr>
            ))
          )}
        </tbody>
      </Table>

      <TablePagination
        page={inventory.page}
        totalPages={inventory.totalPages}
        total={inventory.total}
        basePath="/admin/inventory"
        params={params}
      />
    </div>
  );
}
