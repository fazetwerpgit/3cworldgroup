// @vitest-environment jsdom
//
// Ask 3C's composer when a question gets no answer: Try again for a failure
// that can pass, none at the daily limit, where it would only hit it again.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => 'token' }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'r1', role: 'rep' } }) }));
vi.mock('@/lib/ask/flag', () => ({ askOpenTo: () => true, practiceOpenTo: () => false }));
vi.mock('@/hooks/usePrefersReducedMotion', () => ({ usePrefersReducedMotion: () => true }));
vi.mock('border-beam', () => ({ BorderBeam: ({ children }: { children: ReactNode }) => children }));

import { RepAsk } from './RepAsk';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const fetchMock = vi.fn();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const hasTryAgain = () => [...container.querySelectorAll('button')].some((b) => b.textContent?.includes('Try again'));

async function ask(value: string) {
  const box = container.querySelector('textarea') as HTMLTextAreaElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    setter.call(box, value);
    box.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    container.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

beforeEach(async () => {
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  Element.prototype.scrollIntoView = () => {};
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<RepAsk />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('RepAsk failures', () => {
  it('offers Try again when the model could not answer', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "Ask 3C couldn't answer right now." }, 502));
    await ask('Where is my order?');
    expect(container.textContent).toContain("Ask 3C couldn't answer right now.");
    expect(hasTryAgain()).toBe(true);
  });

  it('shows the daily limit with no Try again', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "You've asked 60 questions today, the daily limit. Call Jeremy or Jacob." }, 429));
    await ask('Where is my order?');
    expect(container.textContent).toContain('the daily limit');
    expect(hasTryAgain()).toBe(false);
  });
});
