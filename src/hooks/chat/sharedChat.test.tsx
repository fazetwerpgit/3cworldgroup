// @vitest-environment jsdom
//
// The chat page reuses the rep shell's live channel list and read receipts
// instead of opening a second pair of Firestore listeners.
import { act, useEffect, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const calls = vi.hoisted(() => ({ channelsEnabled: [] as boolean[], unreadUids: [] as Array<string | null | undefined> }));
vi.mock('./useChatChannels', () => ({
  useChatChannels: ({ enabled = true }: { enabled?: boolean } = {}) => {
    calls.channelsEnabled.push(enabled);
    return { channels: [{ id: 'own' }], loading: false, error: '', retry: () => {} };
  },
}));
vi.mock('./useChatUnread', () => ({
  useChatUnread: (_channels: unknown, uid: string | null | undefined) => {
    calls.unreadUids.push(uid);
    return { unreadByChannel: { own: true }, anyUnread: true };
  },
}));

import { SharedChatProvider, useSharedChatChannels, useSharedChatUnread, type SharedChat } from './sharedChat';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const out: { seen: { channels: unknown; unread: unknown } | null } = { seen: null };

function Page() {
  const channels = useSharedChatChannels();
  const unread = useSharedChatUnread(channels.channels, 'rep-1');
  useEffect(() => {
    out.seen = { channels: channels.channels, unread: unread.unreadByChannel };
  });
  return null;
}

function render(node: ReactNode) {
  act(() => root.render(node));
}

beforeEach(() => {
  calls.channelsEnabled = [];
  calls.unreadUids = [];
  out.seen = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('shared chat listeners', () => {
  it('inside the rep shell: uses the shared list and opens no listener of its own', () => {
    const shared: SharedChat = {
      channels: { channels: [{ id: 'shared' }] as never, loading: false, error: '', retry: () => {} },
      unread: { unreadByChannel: { shared: false }, anyUnread: false, lastReadByChannel: {} },
    };
    render(
      <SharedChatProvider value={shared}>
        <Page />
      </SharedChatProvider>
    );
    expect(out.seen).toEqual({ channels: [{ id: 'shared' }], unread: { shared: false } });
    expect(calls.channelsEnabled.every((enabled) => enabled === false)).toBe(true);
    expect(calls.unreadUids.every((uid) => uid === null)).toBe(true);
  });

  it('outside the shell: listens itself', () => {
    render(<Page />);
    expect(out.seen).toEqual({ channels: [{ id: 'own' }], unread: { own: true } });
    expect(calls.channelsEnabled).toContain(true);
    expect(calls.unreadUids).toContain('rep-1');
  });
});
