import { defineConfig, devices } from '@playwright/test';

/**
 * QA cho Boko.
 *  - Mặc định chạy trên LOCAL: https://localhost (nginx + cert self-signed).
 *  - Muốn chạy trên prod Vercel:  $env:BASE_URL='https://boko-three.vercel.app'; npm test
 *  - Cert self-signed local -> bật ignoreHTTPSErrors.
 *  - Render free cold-start (khi trỏ prod) -> timeout dài + retries.
 */
const BASE_URL = (process.env.BASE_URL || 'https://localhost').replace(/\/+$/, '');
const isProd = /vercel\.app|onrender\.com/.test(BASE_URL);

export default defineConfig({
  testDir: './tests',
  timeout: isProd ? 120_000 : 60_000,
  expect: { timeout: isProd ? 30_000 : 15_000 },
  retries: isProd ? 1 : 0,
  workers: 1, // tránh tạo đơn trùng / tranh chấp tài khoản seed
  fullyParallel: false,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'playwright-report' }],
  ],
  use: {
    baseURL: BASE_URL,
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: isProd ? 45_000 : 20_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
