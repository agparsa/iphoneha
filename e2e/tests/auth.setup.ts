import { test as setup } from '@playwright/test';
import { ADMIN_STATE, loginAdmin } from './helpers';

/**
 * Logs the seeded super-admin in once per run and stores the session, so the
 * admin specs don't burn OTP sends (the API allows only a handful per hour).
 */
setup('ورود مدیر و ذخیره نشست', async ({ page }) => {
  await loginAdmin(page);
  await page.context().storageState({ path: ADMIN_STATE });
});
