// @vitest-environment jsdom
//
// "Read by" fetches the list for one message each time it opens and shows a
// loading line, "No one yet", or names with their read time.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReadBySheet } from './ReadBySheet';
import { clockTime } from './chatFormat';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function respond(body: unknown, ok = true) {
  return vi.fn(async () => ({ ok, json: async () => body }) as Response);
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
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

const target = { channelId: 'all-company', messageId: 'm 1' };

describe('ReadBySheet', () => {
  it('renders nothing while closed', () => {
    const authedFetch = respond({ readers: [] });
    act(() => root.render(<ReadBySheet target={null} authedFetch={authedFetch} onClose={vi.fn()} />));
    expect(document.body.textContent).not.toContain('Read by');
    expect(authedFetch).not.toHaveBeenCalled();
  });

  it('loads the readers for the message, portaled to <body>', async () => {
    const readAt = new Date();
    readAt.setHours(9, 42, 0, 0);
    const authedFetch = respond({
      readers: [{ uid: 'u1', name: 'Dana Reed', readAt: readAt.toISOString() }],
      count: 1,
    });
    act(() => root.render(<ReadBySheet target={target} authedFetch={authedFetch} onClose={vi.fn()} />));
    expect(document.body.textContent).toContain('Loading…');
    expect(authedFetch).toHaveBeenCalledWith('/api/portal/chat/channels/all-company/reads?messageId=m%201');

    await flush();
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain('Dana Reed');
    expect(dialog?.textContent).toContain(clockTime(readAt));
    expect(dialog?.textContent).toContain('1 person');
    // Portaled out of the React container (fixed inside <main> breaks on iOS).
    expect(container.contains(dialog)).toBe(false);
  });

  it('says "No one yet" when nobody has read it', async () => {
    act(() => root.render(<ReadBySheet target={target} authedFetch={respond({ readers: [], count: 0 })} onClose={vi.fn()} />));
    await flush();
    expect(document.body.textContent).toContain('No one yet');
  });

  it('shows an error line when the request fails', async () => {
    act(() => root.render(<ReadBySheet target={target} authedFetch={respond({}, false)} onClose={vi.fn()} />));
    await flush();
    expect(document.body.textContent).toContain("Couldn't load who read this");
  });

  it('closes from the Close button', () => {
    const onClose = vi.fn();
    act(() => root.render(<ReadBySheet target={target} authedFetch={respond({ readers: [] })} onClose={onClose} />));
    act(() => document.body.querySelector<HTMLButtonElement>('button[aria-label="Close"]')?.click());
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
