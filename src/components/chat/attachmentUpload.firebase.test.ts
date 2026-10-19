import { afterEach, describe, expect, it, vi } from 'vitest';

// firebasePutFile loads the Storage SDK lazily; these tests swap in fakes for
// both lazy modules so the timeout and chunk-load paths run without Firebase.

type Handlers = { next: (snap: { bytesTransferred: number; totalBytes: number }) => void; error: (e: unknown) => void; complete: () => void };

function fakeStorageSdk() {
  const task = {
    handlers: null as Handlers | null,
    cancel: vi.fn(() => task.handlers?.error({ code: 'storage/canceled' })),
    on: vi.fn((_event: string, next: Handlers['next'], error: Handlers['error'], complete: Handlers['complete']) => {
      task.handlers = { next, error, complete };
    }),
  };
  return {
    task,
    module: { ref: vi.fn(() => ({})), uploadBytesResumable: vi.fn(() => task) },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock('firebase/storage');
  vi.doUnmock('@/lib/firebase/storage');
  vi.resetModules();
});

const pdf = () => new File([new Uint8Array(8)], 'a.pdf', { type: 'application/pdf' });

describe('firebasePutFile', () => {
  it('maps a failed lazy Storage chunk load to a retryable network error', async () => {
    vi.resetModules();
    vi.doMock('firebase/storage', () => {
      throw new TypeError('Failed to fetch dynamically imported module');
    });
    vi.doMock('@/lib/firebase/storage', () => ({ storage: {} }));
    const { firebasePutFile } = await import('./attachmentUpload');
    const { SendRequestError } = await import('@/lib/chat/outbox');
    const error = await firebasePutFile('chat-pending/u/x.pdf', pdf(), () => {}).catch((e) => e);
    expect(error).toBeInstanceOf(SendRequestError);
    expect(error.failure).toEqual({ kind: 'network' });
  });

  it('only cancels after the upload stops moving, not after a fixed total time', async () => {
    vi.resetModules();
    const sdk = fakeStorageSdk();
    vi.doMock('firebase/storage', () => sdk.module);
    vi.doMock('@/lib/firebase/storage', () => ({ storage: {} }));
    const { firebasePutFile, UPLOAD_STALL_TIMEOUT_MS } = await import('./attachmentUpload');
    const { SendRequestError } = await import('@/lib/chat/outbox');
    vi.useFakeTimers();
    const settled = firebasePutFile('chat-pending/u/x.pdf', pdf(), () => {}).catch((e) => e);
    await vi.waitFor(() => expect(sdk.task.handlers).not.toBeNull());

    // A slow but steady upload runs well past 120 s in total.
    for (let i = 1; i <= 5; i++) {
      vi.advanceTimersByTime(100_000);
      sdk.task.handlers!.next({ bytesTransferred: i, totalBytes: 10 });
    }
    expect(sdk.task.cancel).not.toHaveBeenCalled();

    vi.advanceTimersByTime(UPLOAD_STALL_TIMEOUT_MS);
    expect(sdk.task.cancel).toHaveBeenCalledTimes(1);
    const error = await settled;
    expect(error).toBeInstanceOf(SendRequestError);
    expect(error.failure).toEqual({ kind: 'network' });
  });
});
