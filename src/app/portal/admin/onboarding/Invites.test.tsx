// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// One stable auth value: the page refetches whenever `user` changes identity.
vi.mock('@/contexts/AuthContext', () => {
  const auth = { user: { uid: 'owner-1', role: 'owner' }, isRole: () => true, hasPermission: () => true };
  return { useAuth: () => auth };
});
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

const csv = vi.hoisted(() => ({ rows: [] as Array<Record<string, unknown>> }));
vi.mock('@/lib/export/csv', () => ({
  toCsv: (_columns: unknown, rows: Array<Record<string, unknown>>) => {
    csv.rows = rows;
    return '';
  },
  downloadCsv: () => {},
}));

import { Invites } from './Invites';

const APPLICATIONS = [
  { id: 'a1', name: 'Maya Torres', city: 'Austin', email: 'maya@example.com', phone: '(512) 555-0101', referredBy: 'Jordan Reyes', status: 'applied', createdAt: '2026-09-20T12:00:00Z' },
  { id: 'a2', name: 'Leo Park', city: 'Dallas', email: 'leo@example.com', phone: '214-555-0102', referredBy: '', status: 'applied', createdAt: '2026-09-19T12:00:00Z' },
  { id: 'a3', name: 'Ana Silva', city: 'Austin', email: 'ana@example.com', phone: '512-555-0103', referredBy: '', status: 'invited', createdAt: '2026-09-18T12:00:00Z' },
  { id: 'a4', name: 'Sam Cole', city: 'Houston', email: 'sam@example.com', phone: '713-555-0104', referredBy: '', status: 'converted', createdAt: '2026-09-17T12:00:00Z' },
  { id: 'a5', name: 'Kim Diaz', city: 'Waco', email: 'kim@example.com', phone: '254-555-0105', referredBy: '', status: 'not_selected', createdAt: '2026-09-16T12:00:00Z' },
];

let container: HTMLDivElement;
let root: Root;

function panel() {
  return container.querySelector('#applications') as HTMLElement;
}

function rowNames() {
  return [...panel().querySelectorAll('li:not([aria-hidden]) [class*="personName"]')].map((node) => node.textContent);
}

function filterButton(label: string) {
  return [...panel().querySelectorAll('[aria-label="Filter applications"] button')].find((button) =>
    button.textContent?.startsWith(label)
  ) as HTMLButtonElement;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function search(value: string) {
  const input = panel().querySelector('input[type="search"]') as HTMLInputElement;
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = vi.fn();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, json: async () => ({ invites: [], applications: APPLICATIONS }) }))
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<Invites />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(panel().querySelector('ul')).not.toBeNull());
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('opens on new applications and counts every status bucket', async () => {
  expect(rowNames()).toEqual(['Maya Torres', 'Leo Park']);
  expect(filterButton('New').getAttribute('aria-pressed')).toBe('true');
  expect(filterButton('New').textContent).toBe('New2');
  expect(filterButton('Invited').textContent).toBe('Invited1');
  expect(filterButton('Onboarded').textContent).toBe('Onboarded1');
  expect(filterButton('All').textContent).toBe('All5');

  await click(filterButton('Onboarded'));
  expect(rowNames()).toEqual(['Sam Cole']);

  await click(filterButton('All'));
  expect(rowNames()).toEqual(['Maya Torres', 'Leo Park', 'Ana Silva', 'Sam Cole', 'Kim Diaz']);
});

it('shows contact links and the referrer on a row', () => {
  const row = panel().querySelectorAll('li:not([aria-hidden])')[0];
  expect(row.textContent).toContain('Referred by Jordan Reyes');
  expect(row.querySelector('a[href="tel:5125550101"]')).not.toBeNull();
  expect(row.querySelector('a[href="mailto:maya@example.com"]')).not.toBeNull();
});

it('searches name, city, email and phone within the chosen status', async () => {
  await click(filterButton('All'));

  await search('AUSTIN');
  expect(rowNames()).toEqual(['Maya Torres', 'Ana Silva']);

  await search('leo@');
  expect(rowNames()).toEqual(['Leo Park']);

  await search('5125550103');
  expect(rowNames()).toEqual(['Ana Silva']);

  await click(filterButton('New'));
  expect(rowNames()).toEqual([]);
  expect(panel().textContent).toContain('No applications match');
});

it('exports only the rows currently shown', async () => {
  await search('dallas');
  const exportButton = [...panel().querySelectorAll('button')].find((button) => /^Export \d+ shown$/.test(button.textContent ?? ''))!;
  await click(exportButton);
  expect(csv.rows.map((row) => row.id)).toEqual(['a2']);
});

it('offers Invite only on new rows and fills the onboarding form from it', async () => {
  await click(filterButton('All'));
  const inviteButtons = [...panel().querySelectorAll('button')].filter((button) => button.textContent === 'Invite');
  expect(inviteButtons.map((button) => button.getAttribute('aria-label'))).toEqual([
    'Invite Maya Torres',
    'Invite Leo Park',
  ]);

  await click(inviteButtons[1]);

  const value = (id: string) => (container.querySelector(`#${id}`) as HTMLInputElement).value;
  expect(value('invite-application')).toBe('a2');
  expect(value('invite-name')).toBe('Leo Park');
  expect(value('invite-email')).toBe('leo@example.com');
  expect(value('invite-phone')).toBe('214-555-0102');
  expect(value('invite-city')).toBe('Dallas');
  expect(document.activeElement?.id).toBe('invite-name');
  expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
});
