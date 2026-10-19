// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi, type Mock } from 'vitest';

const auth = vi.hoisted(() => ({ user: { uid: 'admin-1', role: 'admin' } }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/admin/UserForm', () => ({ UserForm: () => null }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } } }));
vi.mock('next/navigation', () => ({ useParams: () => ({ id: 'rep-1' }) }));

import EditUserPage from './page';

type Reply = { ok: boolean; body: Record<string, unknown> } | Error;

let container: HTMLDivElement;
let root: Root;
let revealReplies: Reply[];
let fetchMock: Mock<(url: string) => Promise<unknown>>;

function button(label: string) {
  return [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
}

async function click(label: string) {
  await act(async () => {
    button(label)!.click();
  });
}

async function renderPage() {
  await act(async () => {
    root.render(<EditUserPage />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(button('Reveal for this session')).toBeDefined());
  });
  await click('Reveal for this session');
}

beforeEach(async () => {
  auth.user.role = 'admin';
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  revealReplies = [];
  fetchMock = vi.fn(async (url: string) => {
    let reply: Reply = { ok: true, body: {} };
    if (url.includes('?reveal=true')) reply = revealReplies.shift()!;
    else if (url.includes('/admin/sensitive/')) {
      // The route gives the SSN last 4 to owners only; an admin learns it is on file.
      reply = {
        ok: true,
        body:
          auth.user.role === 'owner'
            ? { ssnOnFile: true, ssnLast4: '6789', dlLast4: '4567' }
            : { ssnOnFile: true, dlLast4: '4567' },
      };
    }
    else if (url.includes('/auth/users/')) reply = { ok: true, body: { user: { uid: 'rep-1', displayName: 'Rep One', status: 'active' } } };
    if (reply instanceof Error) throw reply;
    const { ok, body } = reply;
    return { ok, status: ok ? 200 : 500, json: async () => body };
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('shows the error with a Retry, not "Reveal logged", when the reveal fails', async () => {
  await renderPage();
  revealReplies.push({ ok: false, body: { error: 'Failed to read sensitive fields' } });

  await click('Continue');

  expect(container.textContent).not.toContain('Reveal logged');
  expect(container.textContent).toContain('Failed to read sensitive fields');
  expect(container.textContent).toContain('•••••4567');

  revealReplies.push({ ok: true, body: { ssnOnFile: true, dlNumber: 'D1234567' } });
  await click('Retry');

  expect(container.textContent).toContain('D1234567');
  expect(container.textContent).toContain('Reveal logged for this session.');
});

it('shows an admin only that an SSN is on file, never its digits', async () => {
  await renderPage();

  expect(container.textContent).toContain('On file, owners only');
  expect(container.textContent).not.toContain('6789');
  expect(container.textContent).toContain('Tax and banking details are visible to owners only.');
});

it('shows an owner the masked SSN and reveals it in full', async () => {
  auth.user.role = 'owner';
  await renderPage();

  expect(container.textContent).toContain('•••••6789');
  expect(container.textContent).not.toContain('owners only');

  revealReplies.push({ ok: true, body: { ssn: '123456789', ssnLast4: '6789', dlNumber: 'D1234567' } });
  await click('Continue');

  expect(container.textContent).toContain('123-45-6789');
});

it('catches a network error instead of leaving the button dead', async () => {
  await renderPage();
  revealReplies.push(new TypeError('Failed to fetch'));

  await click('Continue');

  expect(container.textContent).toContain('Failed to fetch');
  expect(container.textContent).not.toContain('Reveal logged');
  expect(button('Retry')).toBeDefined();
});
