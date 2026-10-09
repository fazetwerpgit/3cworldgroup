// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThreadMessage } from '@/components/chat/MobileThread';
import { failedStatusLabel } from '@/components/chat/chatFormat';
import { chatMessageDocId, outboxKey } from '@/lib/chat/outbox';

const fake = vi.hoisted(() => ({
  user: { uid: 'u1' } as { uid: string } | null,
  // Who Firebase Auth says is signed in right now (can lag or lead the context).
  authUid: 'u1' as string | null,
  canChat: true,
  photos: new Map<string, File>(),
  upload: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ user: fake.user, hasPermission: (p: string) => p === 'chat:read' && fake.canChat }),
}));
vi.mock('@/lib/firebase/config', () => ({
  auth: {
    get currentUser() {
      return fake.authUid ? { uid: fake.authUid, getIdToken: async () => 'token' } : null;
    },
  },
}));
vi.mock('@/components/chat/attachmentUpload', () => ({
  prepareImageForUpload: async (file: File) => ({ file, width: 10, height: 20 }),
  uploadChatImageWithProgress: fake.upload,
}));
vi.mock('@/lib/chat/pendingPhotos', () => ({
  savePendingPhoto: vi.fn(async (id: string, file: File) => {
    fake.photos.set(id, file);
  }),
  loadPendingPhoto: vi.fn(async (id: string) => fake.photos.get(id) ?? null),
  prunePendingPhotos: vi.fn(async () => undefined),
}));

import { ChatOutboxProvider, useChatOutbox } from './ChatOutboxContext';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const CID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const ECHO_ID = chatMessageDocId('u1', CID);
const UPLOADED = { type: 'image' as const, url: 'https://storage/x.jpg', width: 10, height: 20 };

let outbox: ReturnType<typeof useChatOutbox>;
function Capture() {
  const value = useChatOutbox();
  useEffect(() => {
    outbox = value;
  });
  return null;
}
// Stands in for the Chat page: mounted only while the rep is on it.
function ChatPage() {
  return <span data-testid="chat">chat</span>;
}

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

function render(showChat: boolean) {
  act(() =>
    root.render(
      <ChatOutboxProvider>
        <Capture />
        {showChat && <ChatPage />}
      </ChatOutboxProvider>
    )
  );
}

function echo(overrides: Partial<ThreadMessage> = {}): ThreadMessage {
  return {
    id: ECHO_ID,
    clientMessageId: CID,
    channelId: 'c1',
    text: 'on my way',
    authorId: 'u1',
    authorName: 'Rep One',
    createdAt: new Date(),
    reactionCounts: {},
    myReactions: [],
    pendingState: 'sending',
    ...overrides,
  };
}

function respond(status: number, body: Record<string, unknown>) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

function posts() {
  return fetchMock.mock.calls.map((call) => JSON.parse(String((call[1] as RequestInit).body)));
}

async function settle() {
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  fake.user = { uid: 'u1' };
  fake.authUid = 'u1';
  fake.canChat = true;
  fake.photos.clear();
  fake.upload.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  URL.createObjectURL = vi.fn(() => 'blob:preview');
  URL.revokeObjectURL = vi.fn();
  window.localStorage.clear();
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('ChatOutboxProvider', () => {
  it('keeps retrying a failed send after the Chat page closes, and stores it once', async () => {
    fetchMock.mockReturnValueOnce(respond(503, { error: 'busy' }));
    fetchMock.mockReturnValueOnce(respond(200, { success: true, messageId: ECHO_ID }));
    render(true);
    act(() => outbox.send(echo()));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The rep goes to Home: the page unmounts, the portal shell stays.
    render(false);
    await act(async () => {
      vi.advanceTimersByTime(1_500);
    });
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(posts().map((body) => body.clientMessageId)).toEqual([CID, CID]);
    expect(outbox.echoes[0].deliveredId).toBe(ECHO_ID);
  });

  it('is the only flusher: online and foreground events never double-send an echo in flight', async () => {
    let finish: (value: Response) => void = () => undefined;
    fetchMock.mockReturnValueOnce(new Promise<Response>((resolve) => (finish = resolve)));
    render(true);
    act(() => outbox.send(echo()));
    act(() => {
      window.dispatchEvent(new Event('online'));
      document.dispatchEvent(new Event('visibilitychange'));
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    finish(new Response(JSON.stringify({ success: true, messageId: ECHO_ID }), { status: 200 }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('sends a queued message restored from storage on load, without the Chat page', async () => {
    window.localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([
        { id: ECHO_ID, clientMessageId: CID, channelId: 'c1', text: 'queued', authorId: 'u1', authorName: 'Rep One', createdAt: Date.now(), failed: false },
      ])
    );
    fetchMock.mockReturnValue(respond(200, { success: true, messageId: ECHO_ID }));
    render(false);
    await settle();
    expect(posts()).toEqual([expect.objectContaining({ clientMessageId: CID, text: 'queued' })]);
  });

  it('finishes a photo upload and sends it after the rep leaves the Chat page', async () => {
    let finishUpload: (value: typeof UPLOADED) => void = () => undefined;
    fake.upload.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    fetchMock.mockReturnValue(respond(200, { success: true, messageId: ECHO_ID }));
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    render(true);
    act(() => outbox.send(echo({ text: '', pendingFile: file, localPreviewUrl: 'blob:preview' })));
    await settle();

    // Mid-upload the photo is in IndexedDB and the outbox row marks it pending.
    expect(fake.photos.get(ECHO_ID)).toBe(file);
    const stored = JSON.parse(window.localStorage.getItem(outboxKey('u1')) ?? '[]');
    expect(stored).toEqual([expect.objectContaining({ id: ECHO_ID, photoPending: true })]);

    render(false);
    finishUpload(UPLOADED);
    await settle();
    expect(posts()).toEqual([expect.objectContaining({ clientMessageId: CID, attachment: UPLOADED })]);
  });

  it('resumes a photo that was mid-upload when the app closed', async () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fake.photos.set(ECHO_ID, file);
    window.localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([
        { id: ECHO_ID, clientMessageId: CID, channelId: 'c1', text: '', authorId: 'u1', authorName: 'Rep One', createdAt: Date.now(), photoPending: true, failed: false },
      ])
    );
    fake.upload.mockResolvedValue(UPLOADED);
    fetchMock.mockReturnValue(respond(200, { success: true, messageId: ECHO_ID }));
    render(false);
    await settle();
    expect(fake.upload).toHaveBeenCalledTimes(1);
    expect(posts()).toEqual([expect.objectContaining({ clientMessageId: CID, attachment: UPLOADED })]);
  });

  it('marks a restored photo whose file is gone as lost, and can send its caption alone', async () => {
    window.localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([
        { id: ECHO_ID, clientMessageId: CID, channelId: 'c1', text: 'the gate code', authorId: 'u1', authorName: 'Rep One', createdAt: Date.now(), photoPending: true, failed: false },
      ])
    );
    fetchMock.mockReturnValue(respond(200, { success: true, messageId: ECHO_ID }));
    render(false);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(outbox.echoes).toHaveLength(1);
    expect(outbox.echoes[0]).toMatchObject({ pendingState: 'failed', photoLost: true });
    expect(failedStatusLabel(outbox.echoes[0])).toBe('Photo not sent');

    act(() => outbox.sendTextOnly(outbox.echoes[0]));
    await settle();
    expect(posts()).toEqual([expect.objectContaining({ clientMessageId: CID, text: 'the gate code' })]);
    expect(posts()[0]).not.toHaveProperty('attachment');
  });

  it('loads a restored photo once when an online flush races the restore', async () => {
    const file = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    fake.photos.set(ECHO_ID, file);
    window.localStorage.setItem(
      outboxKey('u1'),
      JSON.stringify([
        { id: ECHO_ID, clientMessageId: CID, channelId: 'c1', text: '', authorId: 'u1', authorName: 'Rep One', createdAt: Date.now(), photoPending: true, failed: false },
      ])
    );
    fake.upload.mockResolvedValue(UPLOADED);
    fetchMock.mockReturnValue(respond(200, { success: true, messageId: ECHO_ID }));
    render(false);
    act(() => {
      window.dispatchEvent(new Event('online'));
    });
    await settle();
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never posts a queued message once a different account is signed in', async () => {
    let finishUpload: (value: typeof UPLOADED) => void = () => undefined;
    fake.upload.mockReturnValue(new Promise((resolve) => (finishUpload = resolve)));
    render(false);
    act(() => outbox.send(echo({ text: '', pendingFile: new File(['x'], 'a.jpg', { type: 'image/jpeg' }) })));
    await settle();
    // Firebase Auth already reports the next account before the context catches up.
    fake.authUid = 'u2';
    finishUpload(UPLOADED);
    await settle();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does no outbox storage work for a user without chat access', async () => {
    fake.canChat = false;
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    render(false);
    await settle();
    expect(getItem).not.toHaveBeenCalled();
    getItem.mockRestore();
  });

  it('does not carry one account’s queue into the next', async () => {
    fetchMock.mockReturnValue(respond(503, { error: 'busy' }));
    render(false);
    act(() => outbox.send(echo()));
    await settle();
    fake.user = { uid: 'u2' };
    render(false);
    await settle();
    expect(outbox.echoes).toEqual([]);
    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
