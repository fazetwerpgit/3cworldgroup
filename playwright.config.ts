import { defineConfig, devices } from '@playwright/test';

// End-to-end tests drive a real browser against the LIVE deployed site.
// Required env vars (never commit real values):
//   E2E_BASE_URL    - the deployed site, e.g. https://3cworldgroup.vercel.app
//   E2E_BOT_SECRET  - strong secret; QA bot passwords are derived as `${secret}#<n>`
//   E2E_BOT_COUNT   - optional, number of QA bots per form (default 3)
// Create the bot pool first with: E2E_BOT_SECRET=... npm run e2e:setup
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
