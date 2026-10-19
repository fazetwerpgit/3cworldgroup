// @vitest-environment jsdom
//
// Team Chat page-level guards:
// - a crafted ?channel= deep link ('a/b') must never reach the Firestore hooks
//   (collection() throws on an even segment count and crashes the page);
// - a desktop photo/PDF staged in one channel must not ride along to the next.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  useMessagesIds: [] as Array<string | null>,
  pinnedIds: [] as Array<string | null>,
  send: vi.fn(),
  outbox: null as unknown as Record<string, unknown>,
  channels: [] as Array<{ id: string; name: string; audience: string }>,
  allChannels: [
    { id: 'managers', name: 'Managers', audience: 'managers' },
    { id: 'all-company', name: 'All Company', audience: 'all' },
  ],
}));

vi.mock('@/lib/firebase/config', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 't' } } }));
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { uid: 'me', displayName: 'Me', role: 'manager', roles: ['manager'] },
    hasPermission: () => false,
    isRole: () => false,
  }),
}));
vi.mock('@/contexts/ChatOutboxContext', () => ({
  useChatOutbox: () => h.outbox,
}));
vi.mock('@/hooks/chat/sharedChat', () => ({
  useSharedChatChannels: () => ({ channels: h.channels, loading: false, error: '', retry: vi.fn() }),
  useSharedChatUnread: () => ({ unreadByChannel: {}, lastReadByChannel: {} }),
}));
vi.mock('@/hooks/chat/useChatUnreadCounts', () => ({ useChatUnreadCounts: () => ({}) }));
vi.mock('@/hooks/chat/useChatSafety', () => ({
  useChatSafety: () => ({
    blockedUids: new Set<string>(),
    termsAccepted: true,
    requireTerms: () => false,
    acceptTerms: vi.fn(),
    report: vi.fn(),
    block: vi.fn(),
    unblock: vi.fn(),
  }),
}));
vi.mock('@/hooks/chat/useMarkChannelRead', () => ({ useMarkChannelRead: () => undefined }));
vi.mock('@/hooks/chat/useConnectionNotice', () => ({ useConnectionNotice: () => ({ notice: null }) }));
vi.mock('@/hooks/chat/useLiveAppended', () => ({ useLiveAppended: () => new Set<string>() }));
vi.mock('@/hooks/chat/usePinnedMessage', () => ({
  usePinnedMessage: (id: string | null) => {
    h.pinnedIds.push(id);
    return null;
  },
}));
vi.mock('@/hooks/chat/useMessages', () => ({
  GROW_STEP: 50,
  MAX_WINDOW: 500,
  useMessages: (id: string | null) => {
    h.useMessagesIds.push(id);
    return {
      messages: [],
      loading: false,
      error: '',
      hasMore: false,
      historyCapped: false,
      loadOlder: vi.fn(),
      windowSize: 50,
      snapshotVersion: 0,
      lastSnapshotWindow: 50,
      renderedChannel: id,
      fromCache: false,
    };
  },
}));
vi.mock('@/lib/app/isNativeApp', () => ({ useIsNativeApp: () => false }));
vi.mock('@/lib/app/bridge', () => ({ reportChatContext: vi.fn() }));
vi.mock('@/components/chat/MobileChannelList', () => ({
  MobileChannelList: () => null,
  ChannelRows: (props: { channels: Array<{ id: string; name: string }>; onSelect: (id: string) => void }) => (
    <div>
      {props.channels.map((ch) => (
        <button key={ch.id} type="button" data-channel={ch.id} onClick={() => props.onSelect(ch.id)}>
          {ch.name}
        </button>
      ))}
    </div>
  ),
}));
vi.mock('@/components/chat/MobileThread', () => ({ MobileThread: () => null }));
vi.mock('@/components/chat/ChannelInfoSheet', () => ({ ChannelInfoSheet: () => null }));
vi.mock('@/components/chat/ChatTermsSheet', () => ({ ChatTermsSheet: () => null }));
vi.mock('@/components/chat/CompanyTape', () => ({ CompanyTape: () => null }));

h.outbox = {
  send: h.send,
  sendTextOnly: vi.fn(),
  retry: vi.fn(),
  retryTermsBlocked: vi.fn(),
  discard: vi.fn(),
  reconcile: vi.fn(),
  subscribeErrors: () => () => undefined,
  subscribeTermsRequired: () => () => undefined,
  echoes: [],
};

import TeamChatPage from './page';

let container: HTMLDivElement;
let root: Root;

// Channels arrive after mount (as they do from Firestore), so the deep-link
// mount effect runs before the first-channel fallback has anything to pick.
function render() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  h.channels = [];
  act(() => root.render(<TeamChatPage />));
  h.channels = h.allChannels;
  act(() => root.render(<TeamChatPage />));
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  h.useMessagesIds.length = 0;
  h.pinnedIds.length = 0;
  h.send.mockClear();
  window.matchMedia = vi.fn().mockImplementation(() => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  })) as unknown as typeof window.matchMedia;
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ enabled: false }))) as typeof fetch;
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  Element.prototype.scrollIntoView = vi.fn();
  globalThis.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.history.replaceState(null, '', '/');
});

describe('TeamChatPage', () => {
  it('ignores a ?channel= value that is not a single Firestore id and falls back to the first channel', () => {
    window.history.replaceState(null, '', '/portal/chat?channel=a%2Fb');
    render();
    expect(h.useMessagesIds).not.toContain('a/b');
    expect(h.pinnedIds).not.toContain('a/b');
    expect(h.useMessagesIds.at(-1)).toBe('managers');
  });

  it('still lands in a valid linked channel', () => {
    window.history.replaceState(null, '', '/portal/chat?channel=all-company');
    render();
    expect(h.useMessagesIds.at(-1)).toBe('all-company');
  });

  it('drops a staged desktop attachment when switching channels', () => {
    window.history.replaceState(null, '', '/portal/chat?channel=managers');
    render();
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['%PDF-1.4'], 'rep-w9.pdf', { type: 'application/pdf' });
    act(() => {
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('rep-w9.pdf');

    act(() => {
      container.querySelector<HTMLButtonElement>('button[data-channel="all-company"]')!.click();
    });
    expect(h.useMessagesIds.at(-1)).toBe('all-company');
    expect(container.textContent).not.toContain('rep-w9.pdf');

    const send = container.querySelector<HTMLButtonElement>('button[aria-label="Send"], button[aria-label="Send message"]');
    if (send && !send.disabled) act(() => send.click());
    expect(h.send).not.toHaveBeenCalled();
  });
});
