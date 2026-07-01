import { test, expect } from '@playwright/test';
import { login, submitAndExpectSuccess, fillByLabel, selectByLabelText, drawSignature } from './helpers';
import { BOTS, Bot } from './bots';

// End-to-end: every form is submitted by EACH bot in the pool (default 3), so each
// form gets multiple independent runs — not just one. Different data per bot proves
// identity-stamping and validation hold across users. Submissions are cleaned up
// afterward by scripts/e2e-cleanup.mjs.

// Per-form test, run once for each bot. `n` varies the data so runs are distinct.
function forEachBot(title: string, body: (page: import('@playwright/test').Page, bot: Bot, n: number) => Promise<void>) {
  for (const bot of BOTS) {
    test(`${title} — bot ${bot.index}`, async ({ page }) => {
      await login(page, bot);
      await body(page, bot, bot.index);
    });
  }
}

forEachBot('Fiber Report submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/fiber-report');
  await selectByLabelText(page, 'T-Fiber');
  await fillByLabel(page, 'Date Knocked', '01/15/2026');
  await fillByLabel(page, 'Pack Number', `QA-PACK-${n}`);
  await fillByLabel(page, 'Number of Reps', String(2 + n));
  await fillByLabel(page, 'Doors Knocked', String(100 + n));
  await fillByLabel(page, 'Customer Contacts', String(30 + n));
  await fillByLabel(page, '# of Sales', String(3 + n));
  await fillByLabel(page, 'Order Number', `QA-ORDER-${n}`);
  await submitAndExpectSuccess(page, '/api/portal/forms/fiber-report', () =>
    page.getByRole('button', { name: /submit report/i }).click()
  );
  await expect(page.getByText(/report submitted/i)).toBeVisible();
});

forEachBot('Payroll Dispute submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/payroll-dispute');
  await fillByLabel(page, 'Contractor Name', `QA Contractor ${n}`);
  await fillByLabel(page, 'Contractor Email', `qa-contractor-${n}@example.com`);
  await selectByLabelText(page, 'T-Fiber');
  await fillByLabel(page, 'Type of Order', 'Fiber install');
  await fillByLabel(page, 'Date of Install', '01/15/2026');
  await submitAndExpectSuccess(page, '/api/portal/forms/payroll-dispute', () =>
    page.getByRole('button', { name: /submit dispute/i }).click()
  );
  await expect(page.getByText(/dispute submitted/i)).toBeVisible();
});

forEachBot('Expedite Order submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/expedite-order');
  await fillByLabel(page, 'Customer Name', `QA Customer ${n}`);
  await fillByLabel(page, 'Customer Phone', '5551234567');
  await fillByLabel(page, 'Street Address', `${100 + n} QA St`);
  await fillByLabel(page, 'City', 'Des Moines');
  await selectByLabelText(page, 'IA'); // state select
  await fillByLabel(page, 'ZIP', '50301');
  await fillByLabel(page, 'Order Number', `QA-EXP-${n}`);
  await fillByLabel(page, 'Desired expedite dates', 'Any date next week');
  await selectByLabelText(page, 'Install too far out');
  await submitAndExpectSuccess(page, '/api/portal/forms/expedite-order', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});

forEachBot('Leads Request submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/leads-request');
  await selectByLabelText(page, 'T-Fiber'); // campaign
  await selectByLabelText(page, 'Jacob Myers'); // manager
  await fillByLabel(page, 'Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Rep First Name', `QA${n}`);
  await fillByLabel(page, 'Rep Last Name', 'Rep');
  await selectByLabelText(page, 'Des Moines IA'); // location
  await submitAndExpectSuccess(page, '/api/portal/forms/leads-request', () =>
    page.getByRole('button', { name: /submit request/i }).click()
  );
});

forEachBot('Manager Interview submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/manager-interview');
  await selectByLabelText(page, 'T-Fiber'); // provider
  await selectByLabelText(page, 'Account Executive'); // job position
  await selectByLabelText(page, 'Jacob Myers'); // hiring manager
  await fillByLabel(page, 'Hiring Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Candidate First Name', `QA${n}`);
  await fillByLabel(page, 'Candidate Last Name', 'Candidate');
  await fillByLabel(page, 'Candidate Email', `qa-candidate-${n}@example.com`);
  await selectByLabelText(page, 'QA Test Market'); // seeded market
  await selectByLabelText(page, 'Yes'); // didShow
  await selectByLabelText(page, 'No'); // extendOffer
  await selectByLabelText(page, '4'); // rating
  await drawSignature(page);
  await submitAndExpectSuccess(page, '/api/portal/forms/manager-interview', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});
