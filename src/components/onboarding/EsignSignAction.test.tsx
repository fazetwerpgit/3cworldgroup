// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loadSignWellEmbedMock, getIdTokenMock } = vi.hoisted(() => ({
  loadSignWellEmbedMock: vi.fn(),
  getIdTokenMock: vi.fn(),
}));

vi.mock('@/lib/esign/embedClient', () => ({
  loadSignWellEmbed: loadSignWellEmbedMock,
}));
vi.mock('@/lib/firebase/getIdToken', () => ({
  getIdToken: getIdTokenMock,
}));

import { EsignSignAction } from './EsignSignAction';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type EmbedEvents = {
  completed?: (e: { id: string }) => void;
  declined?: (e: { id: string; declineReason?: string }) => void;
  closed?: (e: { id: string }) => void;
  error?: (e: unknown) => void;
};

let container: HTMLDivElement;
let root: Root;
let capturedEvents: EmbedEvents | null;
let openMock: ReturnType<typeof vi.fn>;
let fetchMock: ReturnType<typeof vi.fn>;

function makeFakeConstructor() {
  openMock = vi.fn();
  // A vi.fn() mock cannot be invoked with `new` when its implementation is
  // an arrow function — use a real `function` so `new SignWellEmbed(...)`
  // works like the real embed constructor.
  return vi.fn().mockImplementation(function (this: unknown, opts: { events?: EmbedEvents }) {
    capturedEvents = opts.events ?? null;
    return { open: openMock, close: vi.fn() };
  });
}

async function renderAction(onRefresh = vi.fn()) {
  await act(async () => {
    root.render(<EsignSignAction itemId="contract" signingUrl="https://sign.example/x" onRefresh={onRefresh} />);
  });
  return { onRefresh };
}

async function clickSignNow() {
  const button = container.querySelector('button');
  await act(async () => {
    button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // Flush the async open() chain.
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  capturedEvents = null;
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
  getIdTokenMock.mockReset().mockResolvedValue('id-token-123');
  loadSignWellEmbedMock.mockReset().mockImplementation(async () => makeFakeConstructor());
  vi.useFakeTimers();
});

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('EsignSignAction', () => {
  it('renders a Sign now button in the idle state', async () => {
    await renderAction();
    expect(container.textContent).toContain('Sign now');
  });

  it('opens the embed on click and moves to confirming + polls onRefresh on completed', async () => {
    const { onRefresh } = await renderAction();

    await clickSignNow();

    expect(loadSignWellEmbedMock).toHaveBeenCalledOnce();
    expect(openMock).toHaveBeenCalledOnce();
    expect(capturedEvents?.completed).toBeTypeOf('function');

    await act(async () => {
      capturedEvents!.completed!({ id: 'doc_1' });
    });

    expect(container.textContent).toContain('Signature received - confirming');
    expect(container.textContent).not.toMatch(/approved/i);

    // First poll tick fires after CONFIRM_POLL_MS (3000ms).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(1);

    // Advance through the remaining 9 allowed ticks (max 10 total).
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000 * 9);
    });
    expect(onRefresh).toHaveBeenCalledTimes(10);

    // No further polling beyond the max.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000 * 3);
    });
    expect(onRefresh).toHaveBeenCalledTimes(10);
  });

  it('shows a decline warning on the declined event without polling', async () => {
    const { onRefresh } = await renderAction();
    await clickSignNow();

    await act(async () => {
      capturedEvents!.declined!({ id: 'doc_1', declineReason: 'changed my mind' });
    });

    expect(container.textContent).toContain('You declined this document');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it('reports failure and shows the failure note on the embed error event', async () => {
    await renderAction();
    await clickSignNow();

    await act(async () => {
      capturedEvents!.error!(new Error('boom'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toMatch(/snag preparing this document/i);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/portal/onboarding/esign-embed-error',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ itemId: 'contract' }),
      })
    );
    const [, requestInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(requestInit.headers).toMatchObject({ Authorization: 'Bearer id-token-123' });
  });

  it('reports failure when the embed script fails to load', async () => {
    loadSignWellEmbedMock.mockReset().mockRejectedValue(new Error('script failed'));
    await renderAction();

    await clickSignNow();

    expect(container.textContent).toMatch(/snag preparing this document/i);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
