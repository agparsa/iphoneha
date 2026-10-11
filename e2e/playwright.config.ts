import { defineConfig, devices } from '@playwright/test';

const WEB_URL = process.env.E2E_WEB_URL ?? 'http://localhost:3000';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:4000';

/**
 * The suites assume the API (port 4000) and the web app (port 3000) are already
 * running against a seeded database — `pnpm e2e:up` in the repo root does that.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_URL,
    locale: 'fa-IR',
    timezoneId: 'Asia/Tehran',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    actionTimeout: 15_000,
    extraHTTPHeaders: { 'accept-language': 'fa-IR,fa;q=0.9' },
  },
  projects: [
    // logs the admin in once and stores the session for the admin specs
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...devices['Desktop Chrome'], baseURL: WEB_URL } },
    {
      // iPhone metrics on Chromium — swap browserName to 'webkit' where the
      // WebKit build is installed (`playwright install webkit`).
      name: 'mobile',
      use: {
        ...devices['iPhone 14'],
        browserName: process.env.E2E_MOBILE_BROWSER === 'webkit' ? 'webkit' : 'chromium',
        baseURL: WEB_URL,
        isMobile: true,
        hasTouch: true,
      },
      testMatch: /storefront\.spec\.ts/,
    },
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, viewport: { width: 1366, height: 900 } },
      testIgnore: [/auth\.setup\.ts/, /installments-off\.spec\.ts/],
      dependencies: ['setup'],
    },
    {
      // turns the credit services off and on again; the storefront's short
      // cache would leak that into whatever ran next, so it runs last
      name: 'settings',
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL, viewport: { width: 1366, height: 900 } },
      testMatch: /installments-off\.spec\.ts/,
      dependencies: ['desktop', 'mobile'],
    },
  ],
  metadata: { apiUrl: API_URL },
});
