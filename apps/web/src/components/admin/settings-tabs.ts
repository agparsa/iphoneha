/** The tabs of /admin/settings; `?tab=alerts` opens one directly. Plain module: the server page reads it too. */
export const SETTINGS_TABS = [
  'store',
  'home',
  'payments',
  'credit',
  'ledger',
  'alerts',
  'commerce',
  'seo',
] as const;
export type SettingsTab = (typeof SETTINGS_TABS)[number];

export function isSettingsTab(value: string | undefined): value is SettingsTab {
  return SETTINGS_TABS.includes(value as SettingsTab);
}
