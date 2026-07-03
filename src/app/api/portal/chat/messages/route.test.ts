import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock the verified-chat-user gate so we control identity, and adminDb for the write.
vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

const addMock = vi.fn<(doc: Record<string, unknown>) => Promise<{ id: string }>>(
  async () => ({ id: 'msg123' })
);
const setMock = vi.fn(async () => undefined);
// Per-message set (edit path) — recorded separately so PATCH assertions don't
// collide with the channel-level set used by ensureChatChannelMember.
const msgSetMock = vi.fn<
  (payload: Record<string, unknown>, options?: { merge?: boolean }) => Promise<undefined>
>(async () => undefined);

// Message docs addressed by messages.doc(id) — reply sources and PATCH targets.
// deletedAt truthy ⇒ soft-deleted.
const MESSAGE_DOCS: Record<string, Record<string, unknown>> = {
  'src-text': { authorId: 'other-uid', authorName: 'Author One', text: 'Original message text', deletedAt: null },
  'src-long': { authorId: 'other-uid', authorName: 'Author One', text: 'x'.repeat(300), deletedAt: null },
  'src-photo': {
    authorId: 'other-uid',
    authorName: 'Author One',
    text: '',
    attachment: { type: 'image', url: 'https://example/x.png' },
    deletedAt: null,
  },
  'src-gif': {
    authorId: 'other-uid',
    authorName: 'Author One',
    text: '',
    attachment: { type: 'gif', url: 'https://media.tenor.com/x.gif' },
    deletedAt: null,
  },
  'src-deleted': { authorId: 'other-uid', authorName: 'Author One', text: 'gone', deletedAt: { seconds: 1 } },
  'own-msg': { authorId: 'real-uid', authorName: 'Real User', text: 'my message', deletedAt: null },
  'others-msg': { authorId: 'someone-else', authorName: 'Someone', text: 'not mine', deletedAt: null },
  'deleted-msg': { authorId: 'real-uid', authorName: 'Real User', text: 'was here', deletedAt: { seconds: 1 } },
};

function messagesDoc(messageId: string) {
  return {
    get: vi.fn(async () => ({
      id: messageId,
      exists: messageId in MESSAGE_DOCS,
      data: () => MESSAGE_DOCS[messageId],
    })),
    set: msgSetMock,
  };
}

// Two channel docs: the audience-'all' default, and a managers channel that entry_rep
// CANNOT reach by role but IS listed in extraMemberIds (the manually-added path).
const CHANNEL_DOCS: Record<string, Record<string, unknown>> = {
  'all-company': {
    id: 'all-company',
    name: 'All Company',
    description: 'Company-wide updates and quick coordination.',
    audience: 'all',
    order: 1,
    active: true,
    memberIds: ['real-uid'],
  },
  'managers-extra': {
    id: 'managers-extra',
    name: 'Managers',
    description: 'Manager alignment',
    audience: 'managers',
    order: 4,
    active: true,
    memberIds: ['mgr-1', 'real-uid'],
    extraMemberIds: ['real-uid'],
  },
};

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({
      doc: (channelId: string) => ({
        get: vi.fn(async () => ({
          id: channelId,
          exists: channelId in CHANNEL_DOCS,
          data: () => CHANNEL_DOCS[channelId],
        })),
        set: setMock,
        collection: () => ({ add: addMock, doc: messagesDoc }),
      }),
    }),
  },
}));

import { POST, PATCH } from './route';
import { getVerifiedChatUser } from '@/lib/chat/access';

const mockGate = getVerifiedChatUser as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/messages', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

function patchReq(body: unknown) {
  return new NextRequest('http://localhost/api/portal/chat/messages', {
    method: 'PATCH',
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

// A stable bucket name so attachment-url prefixes are deterministic in tests.
const BUCKET = 'test-bucket.appspot.com';

// Build a valid tokened image download URL under a given channel's folder.
function imageUrl(channelId: string, name = 'abc.png') {
  const encoded = encodeURIComponent(`chat/${channelId}/${name}`);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media&token=tok`;
}

// A moderator (admin) identity — used to prove moderators still can't EDIT others.
const MODERATOR = {
  ok: true,
  user: {
    uid: 'mod-uid',
    displayName: 'Mod User',
    role: 'admin',
    fieldRole: undefined,
    effectiveRole: 'admin',
    canModerate: true,
  },
};

beforeEach(() => {
  mockGate.mockReset();
  addMock.mockClear();
  setMock.mockClear();
  msgSetMock.mockClear();
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;
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

  it('accepts an image attachment with no text and persists hasAttachment', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        attachment: { type: 'image', url: imageUrl('all-company'), width: 800, height: 600 },
      })
    );
    expect(res.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
    const written = addMock.mock.calls[0][0] as {
      text: string;
      hasAttachment?: boolean;
      attachment?: { type: string; url: string; width?: number; height?: number };
    };
    expect(written.text).toBe('');
    expect(written.hasAttachment).toBe(true);
    expect(written.attachment).toMatchObject({ type: 'image', width: 800, height: 600 });
  });

  it('accepts a valid Tenor gif attachment', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        attachment: { type: 'gif', url: 'https://media.tenor.com/abc/def.gif' },
      })
    );
    expect(res.status).toBe(200);
    const written = addMock.mock.calls[0][0] as { attachment?: { type: string } };
    expect(written.attachment?.type).toBe('gif');
  });

  it('rejects a cross-channel/foreign image url', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        // URL points at a DIFFERENT channel's folder.
        attachment: { type: 'image', url: imageUrl('managers') },
      })
    );
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects a gif url that is not on media.tenor.com', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({ channelId: 'all-company', attachment: { type: 'gif', url: 'https://evil.example.com/x.gif' } })
    );
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('drops out-of-range width/height but still stores the attachment', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        text: 'pic',
        attachment: { type: 'image', url: imageUrl('all-company'), width: 99999, height: -4 },
      })
    );
    expect(res.status).toBe(200);
    const written = addMock.mock.calls[0][0] as {
      attachment?: { width?: number; height?: number };
    };
    expect(written.attachment?.width).toBeUndefined();
    expect(written.attachment?.height).toBeUndefined();
  });

  it('lets a manually-added member (extraMemberIds) post to a channel their role would deny', async () => {
    // entry_rep cannot reach a managers-audience channel by role, but is in extraMemberIds.
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'managers-extra', text: 'added rep here' }));
    expect(res.status).toBe(200);
    expect(addMock).toHaveBeenCalledTimes(1);
    const written = addMock.mock.calls[0][0] as { authorId: string; channelId: string };
    expect(written.authorId).toBe('real-uid');
    expect(written.channelId).toBe('managers-extra');
  });

  it('still 403s a non-member on a channel their role denies (extras do not widen everyone)', async () => {
    // rep-2 is neither audience-derived nor in extraMemberIds for managers-extra.
    mockGate.mockResolvedValue({
      ok: true,
      user: {
        uid: 'rep-2',
        displayName: 'Rep Two',
        role: undefined,
        fieldRole: 'entry_rep',
        effectiveRole: 'entry_rep',
        canModerate: false,
      },
    });
    const res = await POST(req({ channelId: 'managers-extra', text: 'should fail' }));
    expect(res.status).toBe(403);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects a reply to an unknown message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'hi', replyToMessageId: 'nope' }));
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('rejects a reply to a deleted message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'hi', replyToMessageId: 'src-deleted' }));
    expect(res.status).toBe(400);
    expect(addMock).not.toHaveBeenCalled();
  });

  it('stamps the reply snippet from the SOURCE doc, ignoring any client-supplied snippet', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        text: 'my reply',
        replyToMessageId: 'src-text',
        // Client tries to spoof the quote — must be ignored.
        replyTo: { messageId: 'src-text', authorName: 'FAKE', text: 'FAKE SNIPPET' },
      })
    );
    expect(res.status).toBe(200);
    const written = addMock.mock.calls[0][0] as {
      replyTo?: { messageId: string; authorName: string; text: string };
    };
    expect(written.replyTo).toEqual({
      messageId: 'src-text',
      authorName: 'Author One',
      text: 'Original message text',
    });
  });

  it('uses "Photo" / "GIF" as the snippet when the source was attachment-only', async () => {
    mockGate.mockResolvedValue(VERIFIED);

    await POST(req({ channelId: 'all-company', text: 'nice pic', replyToMessageId: 'src-photo' }));
    const photoReply = (addMock.mock.calls[0][0] as { replyTo?: { text: string } }).replyTo;
    expect(photoReply?.text).toBe('Photo');

    addMock.mockClear();
    await POST(req({ channelId: 'all-company', text: 'lol', replyToMessageId: 'src-gif' }));
    const gifReply = (addMock.mock.calls[0][0] as { replyTo?: { text: string } }).replyTo;
    expect(gifReply?.text).toBe('GIF');
  });

  it('truncates a long source snippet to 140 chars', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'hi', replyToMessageId: 'src-long' }));
    expect(res.status).toBe(200);
    const written = addMock.mock.calls[0][0] as { replyTo?: { text: string } };
    expect(written.replyTo?.text).toHaveLength(140);
  });
});

describe('PATCH /api/portal/chat/messages (edit own)', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'own-msg', text: 'x' }));
    expect(res.status).toBe(401);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('rejects editing someone else’s message (403)', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'others-msg', text: 'hijack' }));
    expect(res.status).toBe(403);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('rejects a moderator editing someone else’s message (403) — delete ≠ edit', async () => {
    mockGate.mockResolvedValue(MODERATOR);
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'others-msg', text: 'moderated' }));
    expect(res.status).toBe(403);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('rejects editing a deleted message (400)', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'deleted-msg', text: 'undelete' }));
    expect(res.status).toBe(400);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('rejects empty text (400)', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'own-msg', text: '   ' }));
    expect(res.status).toBe(400);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('rejects text over 1000 chars (400)', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await PATCH(
      patchReq({ channelId: 'all-company', messageId: 'own-msg', text: 'x'.repeat(1001) })
    );
    expect(res.status).toBe(400);
    expect(msgSetMock).not.toHaveBeenCalled();
  });

  it('edits an own message: sets text + editedAt and leaves the attachment untouched', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await PATCH(patchReq({ channelId: 'all-company', messageId: 'own-msg', text: 'edited now' }));
    expect(res.status).toBe(200);
    expect(msgSetMock).toHaveBeenCalledTimes(1);
    const [payload, options] = msgSetMock.mock.calls[0];
    expect(payload.text).toBe('edited now');
    expect(payload.editedAt).toBeDefined();
    // Merge write that never touches attachment / replyTo / reactions.
    expect(options?.merge).toBe(true);
    expect(payload).not.toHaveProperty('attachment');
    expect(payload).not.toHaveProperty('replyTo');
    expect(payload).not.toHaveProperty('reactions');
  });
});
