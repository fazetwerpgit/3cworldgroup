import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-chat-user gate so we control identity, and adminDb for the write.
vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

const addMock = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'msg123' }));
const setMock = vi.fn(async () => undefined);
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (channelId: string) => ({
        get: vi.fn(async () => ({
          id: channelId,
          exists: channelId === 'all-company',
          data: () => channelId === 'all-company' ? ({
            id: 'all-company',
            name: 'All Company',
            description: 'Company-wide updates and quick coordination.',
            audience: 'all',
            order: 1,
            active: true,
            memberIds: ['real-uid'],
          }) : undefined,
        })),
        set: setMock,
        collection: () => ({ add: addMock }),
      }),
    }),
  },
}));

import { POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// 'all-company' is a real static channel with audience 'all' (see src/types/chat.ts).
const VERIFIED = {
  ok: true,
  user: {
    uid: 'real-uid',
    displayName: 'Real User',
    role: undefined,
    fieldRole: 'entry_rep',
    effectiveRole: 'entry_rep',
    canModerate: false,
  },
};

beforeEach(() => {
  mockGate.mockReset();
  addMock.mockClear();
  setMock.mockClear();
});

describe('POST /api/portal/chat/messages (hardened)', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req({ channelId: 'all-company', text: 'hi' }));
    expect(res.status).toBe(401);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('stamps the VERIFIED uid, ignoring any spoofed userId/authorId in the body', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({ channelId: 'all-company', text: 'hello', userId: 'victim-uid', authorId: 'victim-uid', authorName: 'Victim' })
    );
    expect(res.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
    const written = addMock.mock.calls[0][0] as unknown as { authorId: string; authorName: string };
    expect(written.authorId).toBe('real-uid'); // NOT the spoofed victim-uid
    expect(written.authorName).toBe('Real User');
  });

  it('rejects an empty message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: '   ' }));
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects an unknown channel', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'not-a-channel', text: 'hi' }));
    expect(res.status).toBe(404);
    expect(addMock).not.toHaveBeenCalled();
  });
});
