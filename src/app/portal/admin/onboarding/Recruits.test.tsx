// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';

// One stable auth value: the page refetches whenever `user` changes identity.
vi.mock('@/contexts/AuthContext', () => {
  const auth = { user: { uid: 'owner-1', role: 'owner' }, isRole: () => true, hasPermission: () => true };
  return { useAuth: () => auth };
});
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

const nav = vi.hoisted(() => ({ params: new URLSearchParams(), push: vi.fn(), replace: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  useSearchParams: () => nav.params,
}));

const csv = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/export/csv', () => ({
  toCsv: (_columns: unknown, rows: Array<Record<string, unknown>>) => {
    csv.rows = rows;
    return '';
  },
  downloadCsv: () => {},
}));

import { Recruits } from './Recruits';

const APPLICATIONS = [
  { id: 'a1', name: 'Maya Torres', city: 'Austin', email: 'maya@example.com', phone: '(512) 555-0101', referredBy: 'Jordan Reyes', interests: ['fiber'], status: 'applied', createdAt: '2026-09-20T12:00:00Z' },
  { id: 'a2', name: 'Leo Park', city: 'Dallas', email: 'leo@example.com', phone: '214-555-0102', referredBy: '', status: 'applied', createdAt: '2026-09-19T12:00:00Z' },
  // Invited: the invite (i1) stands for her.
  { id: 'a3', name: 'Ana Silva', city: 'Austin', email: 'ana@example.com', phone: '512-555-0103', referredBy: '', status: 'invited', createdAt: '2026-09-18T12:00:00Z' },
  { id: 'a4', name: 'Sam Cole', city: 'Houston', email: 'sam@example.com', phone: '713-555-0104', referredBy: '', status: 'converted', createdAt: '2026-09-17T12:00:00Z' },
  { id: 'a5', name: 'Kim Diaz', city: 'Waco', email: 'kim@example.com', phone: '254-555-0105', referredBy: '', status: 'not_selected', createdAt: '2026-09-16T12:00:00Z' },
  // Applied, then invited by hand without the application: the same person by email.
  { id: 'a6', name: 'Ivy Chen', city: 'Plano', email: 'IVY@example.com', phone: '972-555-0106', referredBy: '', status: 'applied', createdAt: '2026-09-15T12:00:00Z' },
];

const invite = (fields: Record<string, unknown>) => ({
  candidateCity: '',
  intendedFieldRole: 'entry_level_rep',
  isIBO: false,
  linkSaved: true,
  ownerName: 'Owner',
  applicationId: null,
  convertedUserId: null,
  expiresAt: '2099-01-01T00:00:00Z',
  submittedAt: null,
  createdAt: '2026-10-01T12:00:00Z',
  ...fields,
});

const INVITES = [
  invite({ id: 'i1', candidateName: 'Ana Silva', candidateEmail: 'ana@example.com', candidatePhone: '512-555-0103', candidateCity: 'Austin', status: 'invited', applicationId: 'a3' }),
  invite({ id: 'i2', candidateName: 'Ivy Chen', candidateEmail: 'ivy@example.com', candidatePhone: '972-555-0106', status: 'in_progress' }),
  invite({ id: 'i3', candidateName: 'Rob Lane', candidateEmail: 'rob@example.com', candidatePhone: '512-555-0107', status: 'submitted', submittedAt: '2026-10-05T12:00:00Z', convertedUserId: 'u-rob' }),
  invite({ id: 'i4', candidateName: 'Ola Berg', candidateEmail: 'ola@example.com', candidatePhone: '512-555-0108', status: 'invited', expiresAt: '2020-01-01T00:00:00Z' }),
];

let container: HTMLDivElement;
let root: Root;
let fetchMock: Mock<(url: string, init?: RequestInit) => Promise<{ ok: boolean; json: () => Promise<unknown> }>>;

function list() {
  return container.querySelector('#recruits') as HTMLElement;
}

function rows() {
  return [...list().querySelectorAll('ul > li')] as HTMLElement[];
}

function rowNames() {
  return rows().map((row) => row.querySelector('[class*="personName"]')?.textContent).sort();
}

function row(name: string) {
  return rows().find((node) => node.querySelector('[class*="personName"]')?.textContent === name)!;
}

function filterButtons() {
  return [...list().querySelectorAll('[role="group"] button')] as HTMLButtonElement[];
}

function button(label: string) {
  return [...container.querySelectorAll('button')].find((node) => node.textContent === label) as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function type(input: HTMLInputElement, value: string) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function search(value: string) {
  await type(container.querySelector('input[type="search"]') as HTMLInputElement, value);
}

async function mount(node: ReactNode, ready: () => unknown) {
  await act(async () => {
    root.render(node);
  });
  await act(async () => {
    await vi.waitFor(() => expect(ready()).toBeTruthy());
  });
}

const formValue = (id: string) => container.querySelector<HTMLInputElement>(`#${id}`)?.value;

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  nav.params = new URLSearchParams();
  nav.push.mockReset();
  nav.replace.mockReset();
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    if (!init?.method || init.method === 'GET') {
      return { ok: true, json: async () => ({ invites: INVITES, applications: APPLICATIONS }) };
    }
    return { ok: true, json: async () => ({ success: true, emailSent: true, expiresAt: '2026-10-21T00:00:00Z' }) };
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await mount(<Recruits />, () => list().querySelector('ul'));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('lists everyone once: applications and invites merged per person', async () => {
  // Needs action first: not invited yet, invited, started, expired, finished.
  expect(filterButtons()[0].getAttribute('aria-pressed')).toBe('true');
  expect(rowNames()).toEqual(['Ana Silva', 'Ivy Chen', 'Leo Park', 'Maya Torres', 'Ola Berg', 'Rob Lane']);

  await click(filterButtons()[1]);
  expect(rowNames()).toEqual([
    'Ana Silva',
    'Ivy Chen',
    'Kim Diaz',
    'Leo Park',
    'Maya Torres',
    'Ola Berg',
    'Rob Lane',
    'Sam Cole',
  ]);
  // Each row says where the person is in words, and the phone is a tap-to-call link.
  for (const node of rows()) expect(node.querySelector('[class*="sentence"]')?.textContent?.trim()).toBeTruthy();
  expect(row('Maya Torres').querySelector('a[href="tel:5125550101"]')).not.toBeNull();
});

it('gives each row only the actions it is waiting on', async () => {
  await click(filterButtons()[1]);
  const actions = (name: string) => row(name).querySelectorAll('button').length;
  // Not invited yet: Invite.
  expect(row('Maya Torres').querySelector('button[aria-label="Invite Maya Torres"]')).not.toBeNull();
  expect(actions('Maya Torres')).toBe(1);
  // Invited or started: copy the link, or resend it.
  expect(row('Ana Silva').querySelector('button[aria-label^="Copy invite link"]')).not.toBeNull();
  expect(row('Ana Silva').querySelector('button[aria-label^="Resend"]')).not.toBeNull();
  expect(actions('Ivy Chen')).toBe(2);
  // Link ran out: resend only.
  expect(row('Ola Berg').querySelector('button[aria-label^="Resend"]')).not.toBeNull();
  expect(actions('Ola Berg')).toBe(1);
  // Finished: Activate (and Reject).
  expect(actions('Rob Lane')).toBe(2);
  // Settled: nothing to do.
  expect(actions('Sam Cole')).toBe(0);
  expect(actions('Kim Diaz')).toBe(0);
});

it('runs the existing activate, reject and resend calls from a row', async () => {
  const posts = () =>
    fetchMock.mock.calls
      .filter(([, init]) => init?.method === 'POST')
      .map(([url, init]) => [url, JSON.parse(String(init?.body))]);

  await click(row('Rob Lane').querySelector('button') as HTMLButtonElement);
  expect(posts().at(-1)).toEqual(['/api/portal/recruiting/convert', { inviteId: 'i3', action: 'approved' }]);

  const [, reject] = row('Rob Lane').querySelectorAll('button');
  await click(reject as HTMLButtonElement);
  await click(row('Rob Lane').querySelector('[role="alert"] button:last-child') as HTMLButtonElement);
  expect(posts().at(-1)).toEqual(['/api/portal/recruiting/convert', { inviteId: 'i3', action: 'rejected' }]);

  await click(row('Ola Berg').querySelector('button[aria-label^="Resend"]') as HTMLButtonElement);
  expect(posts().at(-1)).toEqual(['/api/portal/recruiting/invites/i4', { replaceOpenedLink: false }]);
});

it('Invite on a row opens the form filled from that application', async () => {
  expect(container.querySelector('#invite-form')).toBeNull();
  await click(row('Leo Park').querySelector('button') as HTMLButtonElement);

  expect(formValue('invite-application')).toBe('a2');
  expect(formValue('invite-name')).toBe('Leo Park');
  expect(formValue('invite-email')).toBe('leo@example.com');
  expect(formValue('invite-phone')).toBe('214-555-0102');
  expect(formValue('invite-city')).toBe('Dallas');
  expect(document.activeElement?.id).toBe('invite-name');
});

it('?application=<id> opens the form filled from it, then leaves the URL', async () => {
  nav.params = new URLSearchParams('tab=recruits&application=a2');
  await mount(<Recruits />, () => formValue('invite-name'));

  expect(formValue('invite-application')).toBe('a2');
  expect(formValue('invite-name')).toBe('Leo Park');
  expect(formValue('invite-email')).toBe('leo@example.com');
  expect(document.activeElement?.id).toBe('invite-name');
  expect(nav.replace).toHaveBeenLastCalledWith('/portal/admin/onboarding?tab=recruits', { scroll: false });
});

it('keeps the invite form closed until asked, and Cancel closes and clears it', async () => {
  expect(container.querySelector('#invite-form')).toBeNull();
  await click(button('Send an invite'));
  const name = container.querySelector<HTMLInputElement>('#invite-name')!;
  expect(document.activeElement).toBe(name);
  await type(name, 'Typed Name');

  await click(button('Cancel'));
  expect(container.querySelector('#invite-form')).toBeNull();
  await click(button('Send an invite'));
  expect(formValue('invite-name')).toBe('');
});

it('searches name, city, email and phone digits', async () => {
  await click(filterButtons()[1]);

  await search('AUSTIN');
  expect(rowNames()).toEqual(['Ana Silva', 'Maya Torres']);

  await search('leo@');
  expect(rowNames()).toEqual(['Leo Park']);

  await search('5125550103');
  expect(rowNames()).toEqual(['Ana Silva']);

  await search('nobody here');
  expect(rows()).toEqual([]);
});

it('exports the rows currently shown', async () => {
  await search('dallas');
  await click(button('Export list'));
  expect(csv.rows.map((entry) => entry.name)).toEqual(['Leo Park']);
  expect(csv.rows[0].referredBy).toBe('');
});
