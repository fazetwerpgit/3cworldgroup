import { Page, expect } from '@playwright/test';
import { Bot } from './bots';

// Log a specific QA bot into the portal. The login form lives at /portal and uses
// #email / #password inputs with a "Sign In" submit button.
export async function login(page: Page, bot: Bot) {
  await page.goto('/portal');
  await page.locator('#email').fill(bot.email);
  await page.locator('#password').fill(bot.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  // Land on the dashboard (or any authed page) — the sidebar proves we're in.
  await expect(page.getByText('3C Console')).toBeVisible({ timeout: 20_000 });
}

// Submit a form and assert the API POST to `apiPath` returned HTTP 200 with
// { success: true }. This is the "lands in the right spot" proof — it confirms the
// server accepted the submission for that exact route.
export async function submitAndExpectSuccess(
  page: Page,
  apiPath: string,
  clickSubmit: () => Promise<void>
) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes(apiPath) && r.request().method() === 'POST',
      { timeout: 20_000 }
    ),
    clickSubmit(),
  ]);
  expect(response.status(), `${apiPath} should accept the submission`).toBe(200);
  const body = await response.json().catch(() => ({}));
  expect(body.success, `${apiPath} should return success`).toBe(true);
}

// The wrapper <div> that holds a given field's <Label> + control. Forms render
// each field as <div><Label>X</Label><Input|select .../></div>.
function fieldWrapper(page: Page, labelText: string) {
  return page
    .locator('div', { has: page.locator('label', { hasText: new RegExp(`^${escapeRegex(labelText)}$`) }) })
    .last();
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Fill a text/Input field by its field label.
export async function fillByLabel(page: Page, labelText: string, value: string) {
  await fieldWrapper(page, labelText).locator('input, textarea').first().fill(value);
}

// Select an option in the dropdown belonging to a specific field label. Waits for
// the option to exist first (form option lists load async), then selects it —
// unambiguous even when several selects share option text (e.g. Yes/No).
export async function selectField(page: Page, labelText: string, optionText: string) {
  const select = fieldWrapper(page, labelText).locator('select').first();
  await select.locator('option', { hasText: new RegExp(`^\\s*${escapeRegex(optionText)}\\s*$`) }).waitFor({ state: 'attached', timeout: 15_000 });
  await select.selectOption({ label: optionText });
}

// Draw on the signature canvas (manager-interview) so the required signature exists.
export async function drawSignature(page: Page) {
  const canvas = page.locator('canvas').first();
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Signature canvas not found');
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80);
  await page.mouse.move(box.x + 200, box.y + 40);
  await page.mouse.up();
}
