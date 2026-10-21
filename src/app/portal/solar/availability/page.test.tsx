// @vitest-environment jsdom
//
// My availability (/portal/solar/availability) and its way in from Sales: a
// consultant's own card, never anyone else's, with Google coming back here.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'sam' } }) }));
vi.mock('@/components/portal/rep/RepShell', () => ({
  RepShell: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/admin/UserPicker', () => ({
  UserPicker: () => null,
  pickerName: () => '',
  usePickerUsers: () => ({ users: [], loaded: true }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import MyAvailabilityPage from './page';
import { MyAvailabilityRow } from '@/components/portal/solar/MyAvailabilityRow';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SAM = {
  consultantUid: 'sam',
  name: 'Sam Closer',
  tz: 'America/Chicago',
  slotMin: 60,
  modes: { virtual: [{ day: 1, start: '10:00', end: '17:00' }], in_person: [] },
  phone: '+15125550142',
};

let calls: { url: string; method: string; body: unknown }[];
let getStatus: number;
let container: HTMLDivElement;
let root: Root;

const json = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

beforeEach(() => {
  calls = [];
  getStatus = 200;
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/portal/solar/consultants/sam' && method === 'GET') {
        return getStatus === 200 ? json(200, { consultant: SAM, seeded: false }) : json(getStatus, { error: 'x' });
      }
      if (url === '/api/portal/solar/consultants/sam' && method === 'PUT') {
        return json(200, { consultant: { ...SAM, ...(JSON.parse(String(init!.body)) as object) } });
      }
      if (url === '/api/portal/solar/google/connect' && method === 'POST') return json(500, { error: 'stop here' });
      return json(404, { error: 'unexpected' });
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

const flush = async () => {
  for (let i = 0; i < 5; i++) await act(async () => {});
};
const button = (name: string) =>
  [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === name) as HTMLButtonElement | undefined;

describe('My availability', () => {
  it("asks only for the signed-in person's own card and shows it, with no Remove", async () => {
    act(() => root.render(<MyAvailabilityPage />));
    await flush();
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(['GET /api/portal/solar/consultants/sam']);
    expect(container.querySelector('h1')?.textContent).toBe('My availability');
    expect(container.textContent).toContain('Sam Closer');
    expect(container.textContent).toContain('Your card');
    expect(button('Remove')).toBeUndefined();
    expect(button('Connect Google Calendar')).toBeDefined();
  });

  it('starts the Google sign-in to come back here', async () => {
    act(() => root.render(<MyAvailabilityPage />));
    await flush();
    await act(async () => button('Connect Google Calendar')!.click());
    await flush();
    expect(calls.find((c) => c.method === 'POST')?.body).toEqual({ from: 'web', returnTo: 'availability' });
  });

  it('saves to their own card', async () => {
    act(() => root.render(<MyAvailabilityPage />));
    await flush();
    const slot = [...container.querySelectorAll('button')].find((b) => b.textContent?.includes('30 min'))!;
    await act(async () => slot.click());
    await act(async () => button('Save')!.click());
    await flush();
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/portal/solar/consultants/sam');
    expect(put?.body).toMatchObject({ slotMin: 30 });
  });

  it('says so to someone who takes no consultations', async () => {
    getStatus = 404;
    act(() => root.render(<MyAvailabilityPage />));
    await flush();
    expect(container.textContent).toContain('You don’t take consultations yet');
  });
});

describe('MyAvailabilityRow (Sales)', () => {
  it('links consultants to My availability', async () => {
    act(() => root.render(<MyAvailabilityRow />));
    await flush();
    const link = container.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/portal/solar/availability');
    expect(link?.textContent).toContain('Connect Google Calendar and set your hours');
  });

  it('is not there for anyone without a card', async () => {
    getStatus = 404;
    act(() => root.render(<MyAvailabilityRow />));
    await flush();
    expect(container.innerHTML).toBe('');
  });
});
