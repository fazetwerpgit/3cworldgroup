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
vi.mock('@/components/portal/FormAlertsCard', () => ({ default: () => null }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } } }));

import { FormOptions } from './FormOptions';
import { FORM_OPTION_DEFAULTS } from '@/lib/forms/formOptionsRegistry';

let container: HTMLDivElement;
let root: Root;

function card(title: string) {
  return [...container.querySelectorAll('section')].find((s) => s.querySelector('h2')?.textContent === title)!;
}

beforeEach(async () => {
  Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ options: { ...FORM_OPTION_DEFAULTS, expediteReasons: ['Medical'] } }),
    }))
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<FormOptions />);
  });
  await act(async () => {
    await vi.waitFor(() => expect(card('Expedite Reasons')).toBeDefined());
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it('says a list needs at least one option and will not save it empty', async () => {
  const section = card('Expedite Reasons');
  await act(async () => {
    (section.querySelector('[aria-label="Remove Medical"]') as HTMLButtonElement).click();
  });

  expect(section.textContent).toContain('Add at least one option to save this list.');
  const save = [...section.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;
  expect(save.disabled).toBe(true);
});
