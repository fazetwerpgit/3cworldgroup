// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('@/contexts/AuthContext', () => {
  const auth = { user: { uid: 'admin-1', role: 'admin' } };
  return { useAuth: () => auth };
});
vi.mock('@/components/auth/ProtectedRoute', () => ({
  ProtectedRoute: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } } }));

import { SystemSettings } from './SystemSettings';

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const customInput = () => container.querySelector('#weekly-challenge-custom') as HTMLInputElement;

async function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function render(targetSales: number) {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
    ok: true,
    json: async () => (init?.method === 'PUT' ? { ok: true } : { targetSales }),
  }));
  vi.stubGlobal('fetch', fetchMock);
  await act(async () => {
    root.render(<SystemSettings />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(customInput()).toBeTruthy());
  });
}

beforeEach(() => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([
  ['3', '35', 35],
  ['5', '50', 50],
  ['7', '79', 79],
])('lets an admin type a custom target that starts with a preset digit (%s -> %s)', async (first, full, expected) => {
  await render(10);
  const input = customInput();
  await type(input, first);
  expect(input.value).toBe(first);
  await type(input, full);
  expect(input.value).toBe(full);
  expect(container.textContent).toContain(`Close ${expected} sales by Saturday`);

  const save = [...container.querySelectorAll('button')].find((b) => b.textContent === 'Save changes')!;
  await act(async () => {
    save.click();
  });
  const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
  expect(JSON.parse((put![1] as RequestInit).body as string)).toEqual({ targetSales: expected });
});

it('shows a loaded non-preset target in the custom box and clears it when a preset is picked', async () => {
  await render(42);
  expect(customInput().value).toBe('42');
  const preset = [...container.querySelectorAll('button')].find((b) => b.querySelector('strong')?.textContent === '7')!;
  await act(async () => {
    preset.click();
  });
  expect(customInput().value).toBe('');
  expect(preset.getAttribute('aria-pressed')).toBe('true');
});
