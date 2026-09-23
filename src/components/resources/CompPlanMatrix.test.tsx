// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CompPlanMatrix } from './CompPlanMatrix';

const auth = { user: { uid: 'owner-1' } };
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => auth }));
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const RATES = {
  ae_tier_1: { tfiber: { 'tfiber-300': 40 } },
  operations: { tfiber: { 'tfiber-300': 146.25 } },
  ibo_level_1: { tfiber: { 'tfiber-300': 55 } },
  ibo_level_4: { tfiber: { 'tfiber-300': 243.75 } },
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) =>
    new Response(
      JSON.stringify(init?.method === 'PUT' ? { success: true } : { rates: RATES, margin: {}, version: '7.1' }),
      { status: 200 },
    ),
  );
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

async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find((el) => el.textContent?.includes(label));
  if (!found) throw new Error(`No ${label} button`);
  return found;
}

describe('CompPlanMatrix', () => {
  it('shows no IBO column in view or edit mode', async () => {
    await act(async () => root.render(<CompPlanMatrix />));
    await flush();
    expect(container.textContent).toContain('Ops');
    expect(container.textContent).not.toMatch(/IBO/i);

    act(() => button('Edit plan').click());
    expect(container.querySelector('[aria-label*="IBO"]')).toBeNull();
    expect(container.textContent).not.toMatch(/IBO/i);
  });

  it('keeps the hidden IBO rates when an owner saves an edit', async () => {
    await act(async () => root.render(<CompPlanMatrix />));
    await flush();
    act(() => button('Edit plan').click());

    const input = container.querySelector<HTMLInputElement>('input[aria-label="Account Executive Tier 1 rate for TFiber 300"]')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    act(() => {
      setValue.call(input, '42.5');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Save plan').click());
    await flush();

    const put = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === 'PUT');
    const body = JSON.parse((put![1] as RequestInit).body as string);
    expect(body.rates.ae_tier_1.tfiber['tfiber-300']).toBe(42.5);
    expect(body.rates.ibo_level_1).toEqual(RATES.ibo_level_1);
    expect(body.rates.ibo_level_4).toEqual(RATES.ibo_level_4);
    expect(body.rates.operations).toEqual(RATES.operations);
  });
});
