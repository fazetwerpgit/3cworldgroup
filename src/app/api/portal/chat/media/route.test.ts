import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const BUCKET = 'test-bucket.appspot.com';

const saveMock = vi.fn(async (_buffer: Buffer, _opts: unknown) => undefined);
const fileMock = vi.fn((_path: string) => ({ save: saveMock }));

const firestore = vi.hoisted(() => {
  type DocData = Record<string, unknown>;
  const channels = new Map<string, DocData>();

  function snap(id: string, data: DocData | undefined) {
    return data
      ? { id, exists: true, data: (): DocData => data }
      : { id, exists: false, data: (): undefined => undefined };
  }

  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name === 'chatChannels') {
        return { doc: vi.fn((id: string) => ({ get: vi.fn(async () => snap(id, channels.get(id))) })) };
      }
      throw new Error(`Unexpected collection ${name}`);
    }),
  };

  function reset() {
    channels.clear();
    adminDb.collection.mockClear();
  }

  return { adminDb, channels, reset };
});

vi.mock('@/lib/chat/access', () => ({ getVerifiedChatUser: vi.fn() }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: firestore.adminDb,
  getOnboardingBucket: vi.fn(() => ({ file: fileMock })),
}));

import { POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

const REP = {
  ok: true as const,
  user: {
    uid: 'rep-1',
    displayName: 'Rep One',
    role: undefined,
    fieldRole: 'entry_rep' as const,
    effectiveRole: 'entry_rep' as const,
    canModerate: false,
  },
};

function form(fields: { channelId?: string; file?: File | null }) {
  const fd = new FormData();
  if (fields.channelId !== undefined) fd.set('channelId', fields.channelId);
  if (fields.file) fd.set('file', fields.file);
  return new NextRequest('http://localhost/api/portal/chat/media', { method: 'POST', body: fd });
}

function pngFile(bytes: number, type = 'image/png') {
  return new File([new Uint8Array(bytes)], 'client-name.png', { type });
}

beforeEach(() => {
  firestore.reset();
  mockGate.mockReset();
  saveMock.mockClear();
  fileMock.mockClear();
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;
  firestore.channels.set('all-company', {
    id: 'all-company',
    name: 'All Company',
    audience: 'all',
    order: 1,
    active: true,
  });
  firestore.channels.set('managers', {
    id: 'managers',
    name: 'Managers',
    audience: 'managers',
    order: 4,
    active: true,
  });
});

describe('POST /api/portal/chat/media', () => {
  it('returns 401 when unauthenticated', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Unauthorized', status: 401 });
    const res = await POST(form({ channelId: 'all-company', file: pngFile(10) }));
    expect(res.status).toBe(401);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('returns 403 when the caller cannot access the channel', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(form({ channelId: 'managers', file: pngFile(10) }));
    expect(res.status).toBe(403);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('returns 404 for an unknown channel', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(form({ channelId: 'nope', file: pngFile(10) }));
    expect(res.status).toBe(404);
  });

  it('rejects a disallowed mime type', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(form({ channelId: 'all-company', file: pngFile(10, 'application/pdf') }));
    expect(res.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects prototype-chain content types (__proto__, constructor) — no allow-list bypass', async () => {
    mockGate.mockResolvedValue(REP);
    for (const type of ['__proto__', 'constructor']) {
      const res = await POST(form({ channelId: 'all-company', file: pngFile(10, type) }));
      expect(res.status).toBe(400);
    }
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('rejects a file over 10 MB by actual byte length', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(
      form({ channelId: 'all-company', file: pngFile(10 * 1024 * 1024 + 1) })
    );
    expect(res.status).toBe(400);
    expect(saveMock).not.toHaveBeenCalled();
  });

  it('uploads and returns a tokened URL under the channel folder', async () => {
    mockGate.mockResolvedValue(REP);
    const res = await POST(form({ channelId: 'all-company', file: pngFile(1024) }));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(saveMock).toHaveBeenCalledTimes(1);
    expect(json.contentType).toBe('image/png');
    // URL is a Firebase tokened download URL scoped to chat/all-company/.
    const prefix = `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodeURIComponent(
      'chat/all-company/'
    )}`;
    expect(json.url.startsWith(prefix)).toBe(true);
    expect(json.url).toContain('alt=media&token=');
    // Object path/extension derives from the MIME type, not the client filename.
    const savedPath = fileMock.mock.calls[0][0] as string;
    expect(savedPath).toMatch(/^chat\/all-company\/[0-9a-f-]+\.png$/);
    expect(savedPath).not.toContain('client-name');
    // Download token is written into custom metadata.
    const saveOpts = saveMock.mock.calls[0][1] as {
      metadata: { metadata: { firebaseStorageDownloadTokens: string } };
    };
    expect(saveOpts.metadata.metadata.firebaseStorageDownloadTokens).toBeTruthy();
  });
});
