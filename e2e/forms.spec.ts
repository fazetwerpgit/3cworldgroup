import { test, expect } from '@playwright/test';
import { login, submitAndExpectSuccess, fillByLabel, selectField, drawSignature } from './helpers';
import { BOTS, Bot } from './bots';

// End-to-end: every form is submitted by EACH bot in the pool (default 3), so each
// form gets multiple independent runs. Dropdowns are selected by their field label
// (options load async, so selectField waits for them). Submissions are cleaned up
// afterward by scripts/e2e-cleanup.mjs.

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
  await selectField(page, 'Company Sold', 'T-Fiber');
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
  await selectField(page, 'Campaign', 'T-Fiber');
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
  await selectField(page, 'State', 'Iowa'); // option label is the full name, value "IA"
  await fillByLabel(page, 'ZIP', '50301');
  await fillByLabel(page, 'Order Number', `QA-EXP-${n}`);
  await fillByLabel(page, 'Desired expedite dates', 'Any date next week');
  await selectField(page, 'Reason for expedite', 'Install too far out');
  await submitAndExpectSuccess(page, '/api/portal/forms/expedite-order', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});

forEachBot('Leads Request submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/leads-request');
  await selectField(page, 'Campaign', 'T-Fiber');
  await selectField(page, 'Manager Name', 'Jacob Myers');
  await fillByLabel(page, 'Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Rep First Name', `QA${n}`);
  await fillByLabel(page, 'Rep Last Name', 'Rep');
  await selectField(page, 'Location', 'Des Moines IA');
  await submitAndExpectSuccess(page, '/api/portal/forms/leads-request', () =>
    page.getByRole('button', { name: /submit request/i }).click()
  );
});

forEachBot('Manager Interview submits and lands', async (page, _bot, n) => {
  await page.goto('/portal/manager-interview');
  await selectField(page, 'Provider', 'T-Fiber');
  await selectField(page, 'Job Position', 'Account Executive');
  await selectField(page, 'Hiring Manager', 'Jacob Myers');
  await fillByLabel(page, 'Hiring Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Candidate First Name', `QA${n}`);
  await fillByLabel(page, 'Candidate Last Name', 'Candidate');
  await fillByLabel(page, 'Candidate Email', `qa-candidate-${n}@example.com`);

  // Pick the first REAL configured market. This form legitimately requires markets
  // to be configured (Portal → Admin → Form Options → Hire: Markets). If none are
  // set up yet, skip rather than fail — the form is rendering correctly, there's
  // just no data to select.
  const marketSelect = page.locator('div', { has: page.locator('label', { hasText: /^Market$/ }) }).last().locator('select');
  const marketValues = await marketSelect.locator('option').evaluateAll(
    (opts) => opts.map((o) => (o as HTMLOptionElement).value).filter((v) => v !== '')
  );
  test.skip(marketValues.length === 0, 'No hiring markets configured — add them in Form Options to enable this test.');
  await marketSelect.selectOption(marketValues[0]);

  await selectField(page, 'Did Candidate Show?', 'Yes');
  await selectField(page, 'Extend Offer?', 'No');
  await selectField(page, 'Rate Candidate', '4');
  await drawSignature(page);
  await submitAndExpectSuccess(page, '/api/portal/forms/manager-interview', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});
