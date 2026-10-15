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
import { toChatMessageView } from '@/hooks/chat/useMessages';

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

describe('MobileThread PDF attachments', () => {
  const PDF_URL = 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fc1%2Fdoc.pdf?alt=media&token=t';

  it('renders a delivered PDF as a new-tab link chip, never an img', () => {
    const pdf: ThreadMessage = {
      ...message('pdf', 40),
      text: '',
      attachment: { type: 'file', url: PDF_URL, name: 'Route map.pdf', size: 1258291, contentType: 'application/pdf' },
      hasAttachment: true,
    };
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, pdf] })} />));
    const chip = container.querySelector('[data-attachment-type="file"]');
    expect(chip).toBeInstanceOf(HTMLAnchorElement);
    expect(chip?.getAttribute('href')).toBe(PDF_URL);
    expect(chip?.getAttribute('target')).toBe('_blank');
    expect(chip?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(chip?.textContent).toContain('Route map.pdf');
    expect(chip?.textContent).toContain('1.2 MB');
    expect(chip?.querySelector('img')).toBeNull();
    expect(container.querySelector(`img[src="${PDF_URL}"]`)).toBeNull();
  });

  it('shows a pending PDF echo as an inert chip with its file name', () => {
    const file = new File([new Uint8Array(2048)], 'scan.pdf', { type: '' });
    const echo: ThreadMessage = {
      ...message('echo', 41),
      text: '',
      authorId: 'me',
      pendingState: 'sending',
      pendingFile: file,
      localPreviewUrl: 'blob:local',
    };
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, echo] })} />));
    const chip = container.querySelector('[data-attachment-type="file"]');
    expect(chip?.tagName).toBe('SPAN');
    expect(chip?.textContent).toContain('scan.pdf');
    expect(container.querySelector('img[src="blob:local"]')).toBeNull();
  });

  it('renders a PDF with a preview as a page tile linking to the PDF, not the lightbox', () => {
    const PREVIEW_URL = 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fc1%2Fthumb.webp?alt=media&token=t';
    const onOpenImage = vi.fn();
    const pdf: ThreadMessage = {
      ...message('pdf', 40),
      text: '',
      attachment: {
        type: 'file',
        url: PDF_URL,
        name: 'Route map.pdf',
        size: 1258291,
        contentType: 'application/pdf',
        previewUrl: PREVIEW_URL,
        previewWidth: 618,
        previewHeight: 800,
      },
      hasAttachment: true,
    };
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, pdf], onOpenImage })} />));
    const tile = container.querySelector('[data-pdf-preview="true"]');
    expect(tile).toBeInstanceOf(HTMLAnchorElement);
    expect(tile?.getAttribute('href')).toBe(PDF_URL);
    expect(tile?.getAttribute('target')).toBe('_blank');
    expect(tile?.getAttribute('rel')).toBe('noopener noreferrer');
    const img = tile?.querySelector('img');
    expect(img?.getAttribute('src')).toBe(PREVIEW_URL);
    expect(img?.getAttribute('width')).toBe('618');
    expect(img?.getAttribute('height')).toBe('800');
    expect(tile?.textContent).toContain('PDF');
    expect(tile?.textContent).toContain('Route map.pdf');
    act(() => (tile as HTMLAnchorElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })));
    expect(onOpenImage).not.toHaveBeenCalled();
  });

  it('keeps the preview tile once the realtime feed delivers the stored PDF message', () => {
    // Regression: the Firestore listener's parser (toChatMessageView) rebuilt the
    // attachment field by field and dropped previewUrl, so the pending echo's
    // tile turned into the plain chip as soon as the real message reconciled in.
    const PREVIEW_URL = 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fc1%2Fthumb.webp?alt=media&token=t';
    const stored = toChatMessageView(
      'pdf',
      {
        text: '',
        authorId: 'me',
        authorName: 'Me',
        createdAt: new Date(),
        hasAttachment: true,
        attachment: {
          type: 'file',
          url: PDF_URL,
          name: 'Rate card.pdf',
          size: 4096,
          contentType: 'application/pdf',
          previewUrl: PREVIEW_URL,
          previewWidth: 618,
          previewHeight: 800,
        },
      },
      'c1',
      'me'
    );
    expect(stored.attachment).toMatchObject({ previewUrl: PREVIEW_URL, previewWidth: 618, previewHeight: 800 });
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, stored] })} />));
    const tile = container.querySelector('[data-pdf-preview="true"]');
    expect(tile?.getAttribute('href')).toBe(PDF_URL);
    expect(tile?.querySelector('img')?.getAttribute('src')).toBe(PREVIEW_URL);
  });

  it('keeps an old PDF without a preview as a chip', () => {
    const pdf: ThreadMessage = {
      ...message('pdf', 40),
      text: '',
      attachment: { type: 'file', url: PDF_URL, name: 'Old.pdf', contentType: 'application/pdf' },
      hasAttachment: true,
    };
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, pdf] })} />));
    expect(container.querySelector('[data-pdf-preview]')).toBeNull();
    const chip = container.querySelector('[data-attachment-type="file"]');
    expect(chip?.getAttribute('href')).toBe(PDF_URL);
    expect(chip?.querySelector('img')).toBeNull();
  });

  it('shows a pending PDF echo with its local thumbnail and upload progress, inert', () => {
    const file = new File([new Uint8Array(2048)], 'scan.pdf', { type: 'application/pdf' });
    const echo: ThreadMessage = {
      ...message('echo', 41),
      text: '',
      authorId: 'me',
      pendingState: 'sending',
      pendingFile: file,
      localPreviewUrl: 'blob:pdf',
      localPdfPreviewUrl: 'blob:thumb',
      localPreviewWidth: 800,
      localPreviewHeight: 566,
      uploadProgress: 0.5,
    };
    act(() => root.render(<MobileThread {...props({ messages: [...MESSAGES, echo] })} />));
    const tile = container.querySelector('[data-pdf-preview="true"]');
    expect(tile?.tagName).toBe('SPAN');
    expect(tile?.querySelector('img')?.getAttribute('src')).toBe('blob:thumb');
    expect(tile?.querySelector('[style*="scaleX(0.5)"]')).not.toBeNull();
    expect(container.querySelector('img[src="blob:pdf"]')).toBeNull();
  });

  it('accepts images and PDFs in the picker, without capture', () => {
    act(() => root.render(<MobileThread {...props()} />));
    const input = container.querySelector('input[type="file"]');
    expect(input?.getAttribute('accept')).toBe('image/*,application/pdf');
    expect(input?.hasAttribute('capture')).toBe(false);
  });
});
