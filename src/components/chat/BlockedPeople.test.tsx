// @vitest-environment jsdom
//
// "Blocked people" on the channel info sheet: expanding it loads the reader's
// block list, Unblock runs the page's unblock (which refreshes its blocked set)
// and drops the row, and a failed unblock keeps the row with an error.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedPeople } from './BlockedPeople';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function respond(body: unknown, ok = true) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => ({ ok, json: async () => body }) as Response);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function toggle() {
  return container.querySelector('button[aria-controls="chat-blocked-people"]') as HTMLButtonElement;
}

async function expand() {
  await act(async () => {
    toggle().click();
  });
  await flush();
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('BlockedPeople', () => {
  it('stays collapsed and does not fetch until expanded', () => {
    const fetcher = respond({ blocked: [] });
    act(() => root.render(<BlockedPeople authedFetch={fetcher} onUnblock={vi.fn()} />));
    expect(toggle().getAttribute('aria-expanded')).toBe('false');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('lists blocked people from GET /api/portal/chat/blocks', async () => {
    const fetcher = respond({ blocked: [{ uid: 'u1', name: 'Pat Doe' }, { uid: 'u2', name: 'Sam Roe' }] });
    act(() => root.render(<BlockedPeople authedFetch={fetcher} onUnblock={vi.fn()} />));
    await expand();
    expect(fetcher).toHaveBeenCalledWith('/api/portal/chat/blocks');
    expect(toggle().getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Pat Doe');
    expect(container.textContent).toContain('Sam Roe');
    expect(container.querySelectorAll('button[aria-label^="Unblock"]')).toHaveLength(2);
  });

  it('shows an empty line when nobody is blocked', async () => {
    act(() => root.render(<BlockedPeople authedFetch={respond({ blocked: [] })} onUnblock={vi.fn()} />));
    await expand();
    expect(container.textContent).toContain("You haven't blocked anyone.");
  });

  it('shows the error when the list fails to load', async () => {
    act(() => root.render(<BlockedPeople authedFetch={respond({ error: 'Nope' }, false)} onUnblock={vi.fn()} />));
    await expand();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Nope');
  });

  it('unblocks through onUnblock and drops the row', async () => {
    const onUnblock = vi.fn(async () => {});
    const fetcher = respond({ blocked: [{ uid: 'u1', name: 'Pat Doe' }, { uid: 'u2', name: 'Sam Roe' }] });
    act(() => root.render(<BlockedPeople authedFetch={fetcher} onUnblock={onUnblock} />));
    await expand();
    await act(async () => {
      (container.querySelector('button[aria-label="Unblock Pat Doe"]') as HTMLButtonElement).click();
    });
    await flush();
    expect(onUnblock).toHaveBeenCalledWith('u1');
    expect(container.textContent).not.toContain('Pat Doe');
    expect(container.textContent).toContain('Sam Roe');
  });

  it('keeps the row and shows the error when unblocking fails', async () => {
    const onUnblock = vi.fn(async () => {
      throw new Error("Couldn't unblock. Try again.");
    });
    const fetcher = respond({ blocked: [{ uid: 'u1', name: 'Pat Doe' }] });
    act(() => root.render(<BlockedPeople authedFetch={fetcher} onUnblock={onUnblock} />));
    await expand();
    await act(async () => {
      (container.querySelector('button[aria-label="Unblock Pat Doe"]') as HTMLButtonElement).click();
    });
    await flush();
    expect(container.textContent).toContain('Pat Doe');
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Couldn't unblock. Try again.");
  });
});
