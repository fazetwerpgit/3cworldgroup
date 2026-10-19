// @vitest-environment jsdom
//
// Channel details sheet: a non-JSON error body (a gateway 504 page) shows the
// fallback copy, never a raw JSON parser message; a blocked author's pins show
// the blocked placeholder (no words, name or photo) and their photos leave the
// Photos grid, as in the thread.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatChannel } from '@/types';
import { BLOCKED_PINNED_LABEL } from '@/lib/chat/blocked';
import { ChannelInfoSheet } from './ChannelInfoSheet';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CHANNEL = {
  id: 'all-company',
  name: 'All Company',
  description: '',
  audience: 'all',
  order: 1,
  active: true,
} as unknown as ChatChannel;

let container: HTMLDivElement;
let root: Root;

type Route = { ok?: boolean; body?: unknown; text?: string };

function fetcher(routes: Record<string, Route>) {
  return vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async (url) => {
    const key = Object.keys(routes).find((prefix) => url.includes(prefix));
    const route = key ? routes[key] : { body: {} };
    return {
      ok: route.ok ?? true,
      json: async () => {
        if (route.text !== undefined) return JSON.parse(route.text);
        return route.body;
      },
    } as Response;
  });
}

async function flush() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  });
}

function render(authedFetch: ReturnType<typeof fetcher>, blockedUids?: ReadonlySet<string>) {
  act(() =>
    root.render(
      <ChannelInfoSheet
        channel={CHANNEL}
        open
        onOpenChange={vi.fn()}
        isAdmin={false}
        authedFetch={authedFetch}
        onOpenImage={vi.fn()}
        lightboxOpen={false}
        currentUserId="me"
        blockedUids={blockedUids}
      />
    )
  );
}

async function showTab(label: 'Pinned' | 'Photos') {
  const button = [...document.body.querySelectorAll('button')].find((el) => el.textContent?.trim() === label);
  await act(async () => {
    button!.click();
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
  document.body.innerHTML = '';
});

const GATEWAY_PAGE = 'An error occurred with your deployment';

describe('ChannelInfoSheet', () => {
  it('shows the fallback copy when the members request fails with a non-JSON body', async () => {
    render(fetcher({ '/members': { ok: false, text: GATEWAY_PAGE } }));
    await flush();
    const alert = document.body.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain("Couldn't load members");
    expect(alert).not.toMatch(/JSON|Unexpected token/);
  });

  it('shows the fallback copy when pins or photos fail with a non-JSON body', async () => {
    render(
      fetcher({
        '/members': { body: { members: [] } },
        '/messages/pin': { ok: false, text: GATEWAY_PAGE },
        '/media': { ok: false, text: GATEWAY_PAGE },
      })
    );
    await flush();
    await showTab('Pinned');
    let alert = document.body.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain("Couldn't load pinned messages");
    expect(alert).not.toMatch(/JSON|Unexpected token/);

    await showTab('Photos');
    alert = document.body.querySelector('[role="alert"]')?.textContent ?? '';
    expect(alert).toContain("Couldn't load media");
    expect(alert).not.toMatch(/JSON|Unexpected token/);
  });

  it("hides a blocked author's pinned words, name and photo behind the blocked label", async () => {
    render(
      fetcher({
        '/members': { body: { members: [] } },
        '/messages/pin': {
          body: {
            pins: [
              {
                messageId: 'p1',
                authorId: 'blocked-1',
                text: 'secret words',
                attachment: { type: 'image', url: 'https://img/blocked.jpg' },
                authorName: 'Blocked Person',
                createdAt: null,
                pinnedAt: null,
              },
              { messageId: 'p2', authorId: 'friend-1', text: 'hello all', attachment: null, authorName: 'Friend', createdAt: null, pinnedAt: null },
              { messageId: 'p3', authorId: 'me', text: 'my own pin', attachment: null, authorName: 'Me', createdAt: null, pinnedAt: null },
            ],
          },
        },
      }),
      new Set(['blocked-1', 'me'])
    );
    await flush();
    await showTab('Pinned');
    const text = document.body.textContent ?? '';
    expect(text).toContain(BLOCKED_PINNED_LABEL);
    expect(text).not.toContain('secret words');
    expect(text).not.toContain('Blocked Person');
    expect(document.body.innerHTML).not.toContain('blocked.jpg');
    expect(text).toContain('hello all');
    // Your own pin is never hidden.
    expect(text).toContain('my own pin');
  });

  it("drops a blocked author's photos from the Photos grid", async () => {
    render(
      fetcher({
        '/members': { body: { members: [] } },
        '/media': {
          body: {
            media: [
              { messageId: 'm1', authorId: 'blocked-1', attachment: { type: 'image', url: 'https://img/blocked.jpg' }, authorName: 'Blocked Person', createdAt: null },
              { messageId: 'm2', authorId: 'friend-1', attachment: { type: 'image', url: 'https://img/friend.jpg' }, authorName: 'Friend', createdAt: null },
            ],
          },
        },
      }),
      new Set(['blocked-1'])
    );
    await flush();
    await showTab('Photos');
    expect(document.body.innerHTML).not.toContain('blocked.jpg');
    expect(document.body.innerHTML).not.toContain('Blocked Person');
    expect(document.body.innerHTML).toContain('friend.jpg');
  });

  it('shows the empty line when every photo is from a blocked author', async () => {
    render(
      fetcher({
        '/members': { body: { members: [] } },
        '/media': {
          body: { media: [{ messageId: 'm1', authorId: 'blocked-1', attachment: { type: 'image', url: 'https://img/blocked.jpg' }, authorName: 'Blocked Person', createdAt: null }] },
        },
      }),
      new Set(['blocked-1'])
    );
    await flush();
    await showTab('Photos');
    expect(document.body.textContent).toContain('No photos yet.');
  });
});
