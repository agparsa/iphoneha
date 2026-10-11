import {
  getAdminMe,
  getAdminSettings,
  getAlertStatus,
  getLedgerStatus,
  getPaymentConnections,
} from '@/lib/api/admin';
import { PageHeader } from '@/components/admin/ui';
import { SettingsForms } from '@/components/admin/settings-forms';
import { isSettingsTab } from '@/components/admin/settings-tabs';

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const openTab = isSettingsTab(tab) ? tab : undefined;
  const [settings, admin, alertStatus, paymentConnections, ledger] = await Promise.all([
    getAdminSettings(),
    getAdminMe(),
    getAlertStatus(),
    getPaymentConnections(),
    getLedgerStatus(),
  ]);
  const canWrite = admin?.permissions.includes('settings.write') ?? false;

  return (
    <div>
      <PageHeader
        title="تنظیمات"
        description="اطلاعات فروشگاه، بنرهای صفحه اصلی، پرداخت، قوانین سبد خرید و هشدارهای درخواست و سفارش تازه"
      />
      <SettingsForms
        settings={settings}
        alertStatus={alertStatus}
        paymentConnections={paymentConnections}
        remindersReady={ledger?.remindersReady ?? null}
        canWrite={canWrite}
        tab={openTab}
      />
    </div>
  );
}
