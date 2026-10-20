// @vitest-environment jsdom
//
// Admin > Solar > Setup: each consultant's Google Meet link and phone, which
// the homeowner's confirmation email shows.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));
const auth = vi.hoisted(() => ({ uid: 'sam' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: auth.uid } }) }));
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

let consultants: Record<string, unknown>[];
let calls: { url: string; method: string; body: unknown }[];
let googleNow: unknown;
let container: HTMLDivElement;
let root: Root;
let puts: Record<string, unknown>[];
let putAnswer: (body: Record<string, unknown>) => { status: number; json: unknown };

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  puts = [];
  calls = [];
  consultants = [SAM];
  googleNow = null;
  auth.uid = 'sam';
  putAnswer = (body) => ({
    status: 200,
    json: { consultant: { ...SAM, ...body, meetLink: MEET, phone: '+15125550142' } },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      if (url === '/api/portal/solar/consultants') return json(200, { consultants, seeded: false });
      if (url.startsWith('/api/portal/solar/google/connect')) {
        const method = init?.method ?? 'GET';
        calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : null });
        if (method === 'POST') return json(200, { url: 'https://accounts.google.com/o/oauth2/v2/auth?state=s' });
        if (method === 'DELETE') return json(200, { success: true, revoked: true });
        return json(200, { googleCalendar: googleNow });
      }
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
  delete window.__3C_APP__;
  window.history.replaceState(null, '', '/');
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

const CONNECTED = { connected: true, email: 'sam@gmail.com', connectedAt: '2026-10-19T12:00:00.000Z', freeBusy: true };
const button = (label: string) => [...container.querySelectorAll('button')].find((b) => b.textContent === label);

describe('Google Calendar row', () => {
  it('own card, not connected: the help line and Connect, which opens Google from the app through window.open', async () => {
    window.__3C_APP__ = true;
    const open = vi.fn(() => null);
    vi.stubGlobal('open', open);
    await renderSetup();
    expect(container.textContent).toContain('Not connected');
    expect(container.textContent).toContain(
      "Bookings go on your Google Calendar with their own Meet link, and homeowners only see times you're free."
    );
    await act(async () => button('Connect Google Calendar')!.click());
    await flush();
    expect(calls.find((c) => c.method === 'POST')).toMatchObject({ url: '/api/portal/solar/google/connect', body: { from: 'app' } });
    expect(open).toHaveBeenCalledWith('https://accounts.google.com/o/oauth2/v2/auth?state=s', '_blank');
    expect(container.textContent).toContain('Finish signing in to Google');
    // Back from the browser sheet: the row checks at once and shows the account.
    googleNow = CONNECTED;
    await act(async () => window.dispatchEvent(new Event('focus')));
    await flush();
    expect(container.textContent).toContain('Connected as sam@gmail.com');
    expect(button('Disconnect')).toBeTruthy();
    expect(container.textContent).toContain('This one is the backup.');
  });

  it('own card, connected: Disconnect asks first, then removes the connection', async () => {
    consultants = [{ ...SAM, googleCalendar: CONNECTED }];
    await renderSetup();
    expect(container.textContent).toContain('Connected as sam@gmail.com');
    expect(button('Connect Google Calendar')).toBeUndefined();
    await act(async () => button('Disconnect')!.click());
    expect(container.textContent).toContain('Disconnect your Google Calendar?');
    const strip = container.querySelector('[role="alertdialog"]')!;
    const confirm = [...strip.querySelectorAll('button')].find((b) => b.textContent === 'Disconnect')!;
    await act(async () => confirm.click());
    await flush();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/portal/solar/google/connect');
    expect(container.textContent).toContain('Not connected');
    expect(button('Connect Google Calendar')).toBeTruthy();
  });

  it("someone else's card is status only, plus Disconnect (by uid) for the admin", async () => {
    auth.uid = 'admin1';
    consultants = [{ ...SAM, googleCalendar: CONNECTED }];
    await renderSetup();
    expect(container.textContent).toContain('Connected as sam@gmail.com');
    expect(container.textContent).not.toContain('Bookings go on your Google Calendar');
    expect(button('Connect Google Calendar')).toBeUndefined();
    await act(async () => button('Disconnect')!.click());
    expect(container.textContent).toContain('Disconnect Sam’s Google Calendar?');
    const strip = container.querySelector('[role="alertdialog"]')!;
    await act(async () => [...strip.querySelectorAll('button')].find((b) => b.textContent === 'Disconnect')!.click());
    await flush();
    expect(calls.find((c) => c.method === 'DELETE')?.url).toBe('/api/portal/solar/google/connect?uid=sam');
  });

  it('a broken connection says so and offers Reconnect', async () => {
    consultants = [{ ...SAM, googleCalendar: { connected: false, needsReconnect: true, email: 'sam@gmail.com', connectedAt: CONNECTED.connectedAt } }];
    await renderSetup();
    expect(container.textContent).toContain('Needs reconnecting');
    expect(container.textContent).toContain('Google stopped accepting the connection.');
    expect(button('Reconnect')).toBeTruthy();
  });

  it('back from Google on the web: a banner, and the outcome leaves the address', async () => {
    window.history.replaceState(null, '', '/portal/admin/solar?tab=setup&google=connected');
    consultants = [{ ...SAM, googleCalendar: CONNECTED }];
    await renderSetup();
    expect(container.textContent).toContain('Google Calendar connected.');
    expect(window.location.search).toBe('?tab=setup');
  });

  it('a failed connect explains why', async () => {
    window.history.replaceState(null, '', '/portal/admin/solar?tab=setup&google=error&reason=scope');
    await renderSetup();
    expect(container.textContent).toContain("Google Calendar isn't connected. Calendar access was left unticked");
  });
});
