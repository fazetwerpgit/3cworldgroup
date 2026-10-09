// @vitest-environment jsdom
//
// Opening a thread lands on the newest message before the first paint, by
// moving the thread's own scroller: scrollIntoView also scrolled the installed
// app's shell (taller than the screen by --pwa-bottom-gap) and shifted the
// whole app up — "it jumps up when I first open the chat".
import { act, createRef, useLayoutEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/components/portal/rep/RepShell', () => ({ useHideRepTabBar: () => {} }));
vi.mock('@/lib/firebase/config', () => ({ auth: null, db: null }));

import { MobileThread, type ThreadMessage } from './MobileThread';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeResizeObserver {
  static instances: FakeResizeObserver[] = [];
  constructor(public callback: (entries: Array<{ target: Element; contentRect: { height: number } }>) => void) {
    FakeResizeObserver.instances.push(this);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
}

class FakeIntersectionObserver {
  static instances: FakeIntersectionObserver[] = [];
  constructor(public callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    FakeIntersectionObserver.instances.push(this);
  }
  observe() {}
  disconnect() {}
}

// Every element reports the same tall content; scrollTop is clamped like a browser.
const SCROLL_HEIGHT = 3000;
const CLIENT_HEIGHT = 600;
const scrollTops = new WeakMap<Element, number>();
const originals = {
  scrollHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight'),
  clientHeight: Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight'),
  scrollTop: Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop'),
};

function message(id: string, minute: number): ThreadMessage {
  return {
    id,
    channelId: 'c1',
    text: `hello ${id}`,
    authorId: 'other',
    authorName: 'Other Person',
    createdAt: new Date(2026, 9, 9, 9, minute),
    reactionCounts: {},
    myReactions: [],
  };
}

const MESSAGES = Array.from({ length: 30 }, (_, i) => message(`m${i}`, i));

function props(overrides: Partial<Parameters<typeof MobileThread>[0]> = {}): Parameters<typeof MobileThread>[0] {
  return {
    pinnedMessage: null,
    channelId: 'c1',
    messages: MESSAGES,
    snapshotVersion: 1,
    windowSize: 75,
    lastSnapshotWindow: 75,
    hasMore: false,
    onLoadOlder: vi.fn(),
    companyStats: null,
    authorAvatars: {},
    loading: false,
    renderedChannel: 'c1',
    currentUserId: 'me',
    canModerate: false,
    canPin: false,
    draft: '',
    gifEnabled: false,
    authedFetch: vi.fn(),
    messagesEndRef: createRef<HTMLDivElement>(),
    scrollToBottomSignal: 0,
    formatTime: () => '',
    replyTarget: null,
    editTarget: null,
    replySnippet: () => ({ messageId: '', authorName: '', text: '' }),
    onBack: vi.fn(),
    onOpenInfo: vi.fn(),
    onDraftChange: vi.fn(),
    onSend: vi.fn(),
    onSendImage: vi.fn(),
    onSendGif: vi.fn(),
    onOpenImage: vi.fn(),
    onError: vi.fn(),
    onDelete: vi.fn(),
    onReactionError: vi.fn(),
    onRetryPending: vi.fn(),
    onDiscardPending: vi.fn(),
    onSendTextOnly: vi.fn(),
    connectionNotice: null,
    onReply: vi.fn(),
    onEdit: vi.fn(),
    onCopy: vi.fn(),
    onTogglePin: vi.fn(),
    onCancelReply: vi.fn(),
    onCancelEdit: vi.fn(),
    onSaveEdit: vi.fn(),
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;
const scrollIntoView = vi.fn();
let scrollTopAtLayout: number | null = null;

// Rendered after the thread: its layout effect runs after the thread's layout
// effects and before any passive effect, i.e. at the moment the browser paints.
function PaintProbe() {
  useLayoutEffect(() => {
    const anchor = document.querySelector('[data-mid]');
    const el = anchor?.parentElement?.parentElement;
    scrollTopAtLayout = el ? el.scrollTop : null;
  });
  return null;
}

function scroller() {
  const anchor = container.querySelector('[data-mid]');
  const el = anchor?.closest('[class*="threadScroller"]') ?? anchor?.parentElement?.parentElement;
  if (!(el instanceof HTMLElement)) throw new Error('no scroller');
  return el;
}

beforeEach(() => {
  FakeResizeObserver.instances = [];
  FakeIntersectionObserver.instances = [];
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  Element.prototype.scrollIntoView = scrollIntoView;
  scrollIntoView.mockClear();
  Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => SCROLL_HEIGHT });
  Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => CLIENT_HEIGHT });
  Object.defineProperty(Element.prototype, 'scrollTop', {
    configurable: true,
    get(this: Element) {
      return scrollTops.get(this) ?? 0;
    },
    set(this: Element, value: number) {
      scrollTops.set(this, Math.max(0, Math.min(value, SCROLL_HEIGHT - CLIENT_HEIGHT)));
    },
  });
  // Record where the scroller sits when the browser would paint (after layout
  // effects, before passive effects/rAF).
  scrollTopAtLayout = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  for (const [key, descriptor] of Object.entries(originals)) {
    if (descriptor) Object.defineProperty(Element.prototype, key, descriptor);
    else delete (Element.prototype as unknown as Record<string, unknown>)[key];
  }
});

describe('MobileThread opening scroll', () => {
  it('lands on the newest message by moving its own scroller, never scrollIntoView', () => {
    act(() => root.render(<MobileThread {...props()} />));
    expect(scroller().scrollTop).toBe(SCROLL_HEIGHT - CLIENT_HEIGHT);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('is already at the bottom when the first loaded frame paints', () => {
    act(() =>
      root.render(
        <>
          <MobileThread {...props({ loading: true, renderedChannel: null, messages: [] })} />
          <PaintProbe />
        </>
      )
    );
    act(() =>
      root.render(
        <>
          <MobileThread {...props()} />
          <PaintProbe />
        </>
      )
    );
    expect(scrollTopAtLayout).toBe(SCROLL_HEIGHT - CLIENT_HEIGHT);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('keeps a reader who scrolled up where they are when messages arrive', () => {
    act(() => root.render(<MobileThread {...props()} />));
    const el = scroller();
    el.scrollTop = 400;
    act(() => el.dispatchEvent(new Event('scroll', { bubbles: true })));
    act(() => FakeIntersectionObserver.instances.at(-1)?.callback([{ isIntersecting: false }]));
    act(() =>
      root.render(<MobileThread {...props({ messages: [...MESSAGES, message('m30', 31)], snapshotVersion: 2 })} />)
    );
    expect(el.scrollTop).toBe(400);
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
