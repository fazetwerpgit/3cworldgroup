import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a real browser against the LIVE deployed site.
// Set E2E_BASE_URL to your Vercel/production URL, and E2E_EMAIL / E2E_PASSWORD
// to the dedicated QA test account (created by scripts/e2e-create-test-user.mjs).
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // forms submit real data; keep runs serial and predictable
  workers: 1,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.E2E_BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
