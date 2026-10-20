// @vitest-environment jsdom
//
// Admin > Solar > Setup: each consultant's Google Meet link and phone, which
// the homeowner's confirmation email shows.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));
vi.mock('@/components/admin/UserPicker', () => ({
  UserPicker: () => null,
  pickerName: (p: { displayName?: string }) => p.displayName ?? '',
  usePickerUsers: () => ({ users: [], loaded: true }),
}));

import SolarSetup from './SolarSetup';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const MEET = 'https://meet.google.com/abc-defg-hij';
const SAM = {
  consultantUid: 'sam',
  name: 'Sam Closer',
  tz: 'America/Chicago',
  slotMin: 60,
  modes: { virtual: [{ day: 1, start: '10:00', end: '17:00' }], in_person: [] },
  meetLink: '',
  phone: '+15125550142',
};

let container: HTMLDivElement;
let root: Root;
let puts: Record<string, unknown>[];
let putAnswer: (body: Record<string, unknown>) => { status: number; json: unknown };

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  puts = [];
  putAnswer = (body) => ({
    status: 200,
    json: { consultant: { ...SAM, ...body, meetLink: MEET, phone: '+15125550142' } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/portal/solar/consultants') return json(200, { consultants: [SAM], seeded: false });
      if (url === '/api/portal/settings/solar') return json(200, { notifyOwner: false, recipients: [] });
      if (url.startsWith('/api/portal/solar/consultants/') && init?.method === 'PUT') {
        const body = JSON.parse(String(init.body));
        puts.push(body);
        const a = putAnswer(body);
        return json(a.status, a.json);
      }
      return json(404, {});
    })
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const flush = () => act(async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve();
});

async function renderSetup() {
  await act(async () => root.render(<SolarSetup />));
  await flush();
}

const input = (id: string) => container.querySelector<HTMLInputElement>(`#consultant-sam-${id}`)!;
const saveButton = () => [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;

function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  act(() => {
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const blur = (el: HTMLInputElement) => act(() => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));

describe('consultant Meet link and phone', () => {
  it('shows the saved phone formatted, with phone-friendly inputs and the Meet hint', async () => {
    await renderSetup();
    expect(input('phone').value).toBe('(512) 555-0142');
    expect(input('phone').type).toBe('tel');
    expect(input('phone').inputMode).toBe('tel');
    expect(input('meetLink').type).toBe('url');
    expect(input('meetLink').value).toBe('');
    expect(container.textContent).toContain('Google Meet → New meeting → Create a meeting for later.');
  });

  it('flags a non-Meet link once the field is left, and Save does not send it', async () => {
    await renderSetup();
    type(input('meetLink'), 'https://zoom.us/j/1');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    blur(input('meetLink'));
    expect(input('meetLink').getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Paste a Google Meet link, like https://meet.google.com/abc-defg-hij');
    await act(async () => saveButton().click());
    expect(puts).toHaveLength(0);
  });

  it('tidies a pasted link on blur and saves it with the hours', async () => {
    await renderSetup();
    type(input('meetLink'), 'meet.google.com/ABC-DEFG-HIJ');
    blur(input('meetLink'));
    expect(input('meetLink').value).toBe(MEET);
    expect(saveButton().disabled).toBe(false);
    await act(async () => saveButton().click());
    await flush();
    expect(puts).toHaveLength(1);
    expect(puts[0]).toMatchObject({ tz: 'America/Chicago', slotMin: 60, meetLink: MEET, phone: '(512) 555-0142' });
    expect(container.textContent).toContain('Saved.');
    expect(saveButton().disabled).toBe(true);
  });

  it("shows the API's field error under that field", async () => {
    putAnswer = () => ({ status: 400, json: { error: 'Enter a 10-digit US number, or an international number that starts with +', field: 'phone' } });
    await renderSetup();
    type(input('meetLink'), MEET);
    await act(async () => saveButton().click());
    await flush();
    expect(input('phone').getAttribute('aria-invalid')).toBe('true');
    expect(input('phone').getAttribute('aria-describedby')).toContain('consultant-sam-phone-error');
  });

  it('clearing the phone counts as a change and saves as empty', async () => {
    await renderSetup();
    expect(saveButton().disabled).toBe(true);
    type(input('phone'), '');
    expect(saveButton().disabled).toBe(false);
    putAnswer = (body) => ({ status: 200, json: { consultant: { ...SAM, ...body, phone: '' } } });
    await act(async () => saveButton().click());
    await flush();
    expect(puts[0].phone).toBe('');
    expect(input('phone').value).toBe('');
  });
});
