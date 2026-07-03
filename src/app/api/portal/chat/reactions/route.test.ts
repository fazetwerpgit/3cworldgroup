import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-chat-user gate so we control identity; adminDb is mocked below.
vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

// Two channels: the audience-'all' default, and a managers channel an entry_rep
// can't reach by role but IS listed in extraMemberIds (the manually-added path).
const CHANNEL_DOCS: Record<string, Record<string, unknown>> = {
  'all-company': {
    id: 'all-company',
    name: 'All Company',
    audience: 'all',
    order: 1,
    active: true,
    memberIds: ['real-uid'],
  },
  'managers-extra': {
    id: 'managers-extra',
    name: 'Managers',
    audience: 'managers',
    order: 4,
    active: true,
    memberIds: ['mgr-1', 'real-uid'],
    extraMemberIds: ['real-uid'],
  },
};

// A pristine message (no reactions) and one the caller has ALREADY reacted to, so
// the toggle's remove half can be exercised.
const MESSAGE_DOCS: Record<string, Record<string, unknown>> = {
  msg1: { authorId: 'other-uid', text: 'hello', deletedAt: null },
  'msg-reacted': {
    authorId: 'other-uid',
    text: 'react to me',
    deletedAt: null,
    reactions: { '🔥': ['real-uid'] },
    reactionCounts: { '🔥': 1 },
  },
};

const channelSetMock = vi.fn(async () => undefined);
const txSetMock = vi.fn();
const runTransactionMock = vi.fn(async (fn: (tx: unknown) => Promise<void>) =>
  fn({
    get: async (ref: { _id: string }) => ({
      exists: ref._id in MESSAGE_DOCS,
      data: () => MESSAGE_DOCS[ref._id],
    }),
    set: txSetMock,
  })
);

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (channelId: string) => ({
        get: vi.fn(async () => ({
          id: channelId,
          exists: channelId in CHANNEL_DOCS,
          data: () => CHANNEL_DOCS[channelId],
        })),
        set: channelSetMock,
        // messages subcollection: doc(messageId) yields a ref the transaction reads by _id.
        collection: () => ({ doc: (messageId: string) => ({ _id: messageId }) }),
      }),
    }),
    // Wrapped so the factory (hoisted above the const) doesn't read the mock eagerly.
    runTransaction: (fn: (tx: unknown) => Promise<void>) => runTransactionMock(fn),
  },
}));

import { POST } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/reactions', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

// entry_rep: reaches 'all-company' by role, 'managers-extra' only via extraMemberIds.
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

// rep-2: neither audience-derived nor an extra member of 'managers-extra'.
const NON_MEMBER = {
  ok: true,
  user: {
    uid: 'rep-2',
    displayName: 'Rep Two',
    role: undefined,
    fieldRole: 'entry_rep',
    effectiveRole: 'entry_rep',
    canModerate: false,
  },
};

beforeEach(() => {
  mockGate.mockReset();
  channelSetMock.mockClear();
  txSetMock.mockClear();
  runTransactionMock.mockClear();
});

describe('POST /api/portal/chat/reactions', () => {
  it('rejects an unauthenticated caller (401)', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await POST(req({ channelId: 'all-company', messageId: 'msg1', emoji: '🔥' }));
    expect(res.status).toBe(401);
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('403s a non-member on a channel their role denies', async () => {
    mockGate.mockResolvedValue(NON_MEMBER);
    const res = await POST(req({ channelId: 'managers-extra', messageId: 'msg1', emoji: '🔥' }));
    expect(res.status).toBe(403);
    expect(runTransactionMock).not.toHaveBeenCalled();
  });

  it('lets a manually-added member (extraMemberIds) react on a role-denied channel', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'managers-extra', messageId: 'msg1', emoji: '🔥' }));
    expect(res.status).toBe(200);
    expect(txSetMock).toHaveBeenCalledTimes(1);
  });

  it('toggles a reaction on the happy path', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', messageId: 'msg1', emoji: '🔥' }));
    expect(res.status).toBe(200);
    expect(txSetMock).toHaveBeenCalledTimes(1);
    const [, payload] = txSetMock.mock.calls[0] as [unknown, { reactions: Record<string, string[]> }];
    expect(payload.reactions['🔥']).toContain('real-uid');
  });

  it('removes the reaction on the second toggle (already reacted → cleared)', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', messageId: 'msg-reacted', emoji: '🔥' }));
    expect(res.status).toBe(200);
    expect(txSetMock).toHaveBeenCalledTimes(1);
    const [, payload] = txSetMock.mock.calls[0] as [
      unknown,
      { reactions: Record<string, string[]>; reactionCounts: Record<string, number> },
    ];
    // real-uid was the only reactor, so the emoji is dropped entirely.
    expect(payload.reactions['🔥']).toBeUndefined();
    expect(payload.reactionCounts['🔥']).toBeUndefined();
  });
});
