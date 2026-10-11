import { formatNumberFa } from '@iphoneha/shared';
import { getAdminMe, getColors, getStorages } from '@/lib/api/admin';
import { EmptyRow, PageHeader, Table, Td, Th } from '@/components/admin/ui';
import { ColorDialog } from '@/components/admin/color-dialog';
import { StorageDialog } from '@/components/admin/storage-dialog';

export default async function AdminOptionsPage() {
  const [colors, storages, admin] = await Promise.all([getColors(), getStorages(), getAdminMe()]);
  const canWrite = admin?.permissions.includes('products.write') ?? false;

  return (
    <div className="grid gap-8">
      <section>
        <PageHeader
          title="رنگ‌ها و ظرفیت‌ها"
          description="این‌ها بین همهٔ محصولات مشترک‌اند و هنگام ساخت ترکیب انتخاب می‌شوند"
          action={canWrite ? <ColorDialog /> : undefined}
        />
        <Table>
          <thead>
            <tr>
              <Th className="w-14" />
              <Th>نام</Th>
              <Th>کد</Th>
              <Th>کد رنگ</Th>
              <Th>نام‌های جست‌وجو</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {colors.length === 0 ? (
              <EmptyRow colSpan={canWrite ? 6 : 5} label="رنگی ثبت نشده است" />
            ) : (
              colors.map((color) => (
                <tr key={color.id}>
                  <Td>
                    <span
                      className="block size-7 rounded-full"
                      style={{ backgroundColor: color.hex, boxShadow: 'inset 0 0 0 1px rgb(8 9 10 / 0.12)' }}
                      aria-hidden
                    />
                  </Td>
                  <Td className="text-ink">
                    {color.name}
                    <span className="block text-[11px] text-muted font-display">{color.nameEn}</span>
                  </Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">{color.code}</Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">{color.hex}</Td>
                  <Td className="text-[12px] text-muted">{color.finish ?? '—'}</Td>
                  {canWrite ? (
                    <Td>
                      <ColorDialog color={color} />
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-[15px] font-semibold text-ink">ظرفیت‌های حافظه</h2>
          {canWrite ? <StorageDialog /> : null}
        </div>
        <Table>
          <thead>
            <tr>
              <Th>ظرفیت</Th>
              <Th>برچسب فارسی</Th>
              <Th>برچسب انگلیسی</Th>
              {canWrite ? <Th /> : null}
            </tr>
          </thead>
          <tbody>
            {storages.length === 0 ? (
              <EmptyRow colSpan={canWrite ? 4 : 3} label="ظرفیتی ثبت نشده است" />
            ) : (
              storages.map((storage) => (
                <tr key={storage.id}>
                  <Td className="tabular whitespace-nowrap">{formatNumberFa(storage.capacityGb)} گیگابایت</Td>
                  <Td className="text-ink">{storage.labelFa}</Td>
                  <Td className="whitespace-nowrap font-display text-[12px]">{storage.label}</Td>
                  {canWrite ? (
                    <Td>
                      <StorageDialog storage={storage} />
                    </Td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </Table>
      </section>
    </div>
  );
}
