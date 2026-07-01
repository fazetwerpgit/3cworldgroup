import { test, expect } from '@playwright/test';
import { login, submitAndExpectSuccess, fillByLabel, selectByLabelText, drawSignature } from './helpers';

// End-to-end: for each form, log in as the QA bot, fill it in a real browser, submit,
// and confirm the API accepted it (200 + {success:true}) — i.e. it LANDED. The
// submissions are cleaned up afterward by scripts/e2e-cleanup.mjs.

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('Fiber Report submits and lands', async ({ page }) => {
  await page.goto('/portal/fiber-report');
  await selectByLabelText(page, 'T-Fiber');
  await fillByLabel(page, 'Date Knocked', '01/15/2026');
  await fillByLabel(page, 'Pack Number', 'QA-PACK-001');
  await fillByLabel(page, 'Number of Reps', '3');
  await fillByLabel(page, 'Doors Knocked', '120');
  await fillByLabel(page, 'Customer Contacts', '40');
  await fillByLabel(page, '# of Sales', '5');
  await fillByLabel(page, 'Order Number', 'QA-ORDER-1');
  await submitAndExpectSuccess(page, '/api/portal/forms/fiber-report', () =>
    page.getByRole('button', { name: /submit report/i }).click()
  );
  await expect(page.getByText(/report submitted/i)).toBeVisible();
});

test('Payroll Dispute submits and lands', async ({ page }) => {
  await page.goto('/portal/payroll-dispute');
  await fillByLabel(page, 'Contractor Name', 'QA Contractor');
  await fillByLabel(page, 'Contractor Email', 'qa-contractor@example.com');
  await selectByLabelText(page, 'T-Fiber');
  await fillByLabel(page, 'Type of Order', 'Fiber install');
  await fillByLabel(page, 'Date of Install', '01/15/2026');
  await submitAndExpectSuccess(page, '/api/portal/forms/payroll-dispute', () =>
    page.getByRole('button', { name: /submit dispute/i }).click()
  );
  await expect(page.getByText(/dispute submitted/i)).toBeVisible();
});

test('Expedite Order submits and lands', async ({ page }) => {
  await page.goto('/portal/expedite-order');
  await fillByLabel(page, 'Customer Name', 'QA Customer');
  await fillByLabel(page, 'Customer Phone', '5551234567');
  await fillByLabel(page, 'Street Address', '123 QA St');
  await fillByLabel(page, 'City', 'Des Moines');
  await selectByLabelText(page, 'IA'); // state select
  await fillByLabel(page, 'ZIP', '50301');
  await fillByLabel(page, 'Order Number', 'QA-EXP-1');
  await fillByLabel(page, 'Desired expedite dates', 'Any date next week');
  await selectByLabelText(page, 'Install too far out');
  await submitAndExpectSuccess(page, '/api/portal/forms/expedite-order', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});

test('Leads Request submits and lands', async ({ page }) => {
  await page.goto('/portal/leads-request');
  await selectByLabelText(page, 'T-Fiber'); // campaign
  await selectByLabelText(page, 'Jacob Myers'); // manager
  await fillByLabel(page, 'Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Rep First Name', 'QA');
  await fillByLabel(page, 'Rep Last Name', 'Rep');
  await selectByLabelText(page, 'Des Moines IA'); // location
  await submitAndExpectSuccess(page, '/api/portal/forms/leads-request', () =>
    page.getByRole('button', { name: /submit request/i }).click()
  );
});

test('Manager Interview submits and lands', async ({ page }) => {
  await page.goto('/portal/manager-interview');
  await selectByLabelText(page, 'T-Fiber'); // provider
  await selectByLabelText(page, 'Account Executive'); // job position
  await selectByLabelText(page, 'Jacob Myers'); // hiring manager
  await fillByLabel(page, 'Hiring Manager Email', 'jacob@example.com');
  await fillByLabel(page, 'Candidate First Name', 'QA');
  await fillByLabel(page, 'Candidate Last Name', 'Candidate');
  await fillByLabel(page, 'Candidate Email', 'qa-candidate@example.com');
  await selectByLabelText(page, 'QA Test Market'); // seeded market
  // Did Show / Extend Offer / Rating selects — pick concrete values.
  await selectByLabelText(page, 'Yes'); // first Yes/No (didShow)
  await selectByLabelText(page, 'No'); // extendOffer
  await selectByLabelText(page, '4'); // rating
  await drawSignature(page);
  await submitAndExpectSuccess(page, '/api/portal/forms/manager-interview', () =>
    page.getByRole('button', { name: /submit/i }).click()
  );
});
