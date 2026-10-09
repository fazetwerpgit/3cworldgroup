import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';

// Mock the verified-chat-user gate so we control identity, and adminDb for the write.
vi.mock('@/lib/chat/access', () => ({
  getVerifiedChatUser: vi.fn(),
}));

// The real after() throws when called outside a request scope, which is exactly where
// these tests call the route handlers. Run the scheduled task inline instead and keep
// its promise so a test can await the fan-out it was given.
const afterTasks = vi.hoisted(() => [] as Promise<unknown>[]);
vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: (task: () => unknown) => {
      afterTasks.push(Promise.resolve(task()));
    },
  };
});

const sendPushMock = vi.hoisted(() =>
  vi.fn<(uid: string, tokens: string[], payload: { title: string; body: string; url?: string }) => Promise<unknown>>(
    async () => ({ delivered: 1, failed: 0, pruned: 0 })
  )
);
vi.mock('@/lib/push/sendPush', () => ({ sendPushToTokens: sendPushMock }));

// Recipient user docs the push fan-out re-checks (role/status) before sending.
const USER_DOCS = vi.hoisted((): Record<string, Record<string, unknown>> => ({
  'mgr-1': { status: 'active', fieldRole: 'l1_manager', pushTokens: ['tok-mgr'] },
}));

// Writes made through adminDb.batch() (reply-quote scrubs on DELETE).
const batchUpdates = vi.hoisted(() => [] as Array<{ id: string; data: Record<string, unknown> }>);

// create() of an auto-id message (no client key), as add() used to be.
const addMock = vi.fn<(doc: Record<string, unknown>) => Promise<void>>(async () => undefined);
const setMock = vi.fn(async (_data: Record<string, unknown>, _options?: { merge?: boolean }) => undefined);
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
    attachment: { type: 'gif', url: 'https://media.giphy.com/x.gif' },
    deletedAt: null,
  },
  'src-deleted': { authorId: 'other-uid', authorName: 'Author One', text: 'gone', deletedAt: { seconds: 1 } },
  'own-msg': {
    authorId: 'real-uid',
    authorName: 'Real User',
    text: 'my message',
    deletedAt: null,
    createdAt: Timestamp.fromMillis(2_000_000),
  },
  'others-msg': {
    authorId: 'someone-else',
    authorName: 'Someone',
    text: 'not mine',
    deletedAt: null,
    createdAt: Timestamp.fromMillis(1_000_000),
  },
  'deleted-msg': { authorId: 'real-uid', authorName: 'Real User', text: 'was here', deletedAt: { seconds: 1 } },
  'reply-to-others': {
    authorId: 'real-uid',
    authorName: 'Real User',
    text: 'replying',
    replyTo: { messageId: 'others-msg', authorName: 'Someone', text: 'not mine' },
    deletedAt: null,
  },
};

// create() on a messages.doc(id): the ids already "stored" reject like the
// Admin SDK does (gRPC ALREADY_EXISTS), everything else records the write and
// keeps the doc (server timestamps resolved) so later reads and updates see it.
const createdIds = new Set<string>();
const createdDocs: Record<string, Record<string, unknown>> = {};
const createMock = vi.fn<(messageId: string, doc: Record<string, unknown>) => Promise<void>>(async (messageId) => {
  if (createdIds.has(messageId)) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
  createdIds.add(messageId);
});
const msgUpdateMock = vi.fn<(messageId: string, data: Record<string, unknown>) => Promise<void>>(
  async (messageId, data) => {
    const target = createdDocs[messageId] ?? MESSAGE_DOCS[messageId];
    if (target) Object.assign(target, data);
  }
);
let autoIds = 0;

function storedMessage(messageId: string) {
  return createdDocs[messageId] ?? MESSAGE_DOCS[messageId];
}

function messagesDoc(id?: string) {
  const messageId = id ?? `auto-${++autoIds}`;
  return {
    id: messageId,
    parent: { parent: { id: 'channel' } },
    create: async (doc: Record<string, unknown>) => {
      if (id) await createMock(messageId, doc);
      else await addMock(doc);
      createdDocs[messageId] = { ...doc, createdAt: Timestamp.now() };
    },
    get: vi.fn(async () => ({
      id: messageId,
      exists: !!storedMessage(messageId),
      data: () => storedMessage(messageId),
    })),
    set: msgSetMock,
    update: (data: Record<string, unknown>) => msgUpdateMock(messageId, data),
  };
}

// messages.orderBy('createdAt', 'desc').limit(n) — newest stored messages first.
function messagesOrderBy() {
  return {
    limit: (n: number) => ({
      get: async () => ({
        docs: Object.entries({ ...MESSAGE_DOCS, ...createdDocs })
          .filter(([, data]) => data.createdAt instanceof Timestamp)
          .sort(([, a], [, b]) => (b.createdAt as Timestamp).toMillis() - (a.createdAt as Timestamp).toMillis())
          .slice(0, n)
          .map(([id, data]) => ({ id, data: () => data })),
      }),
    }),
  };
}

// Storage deletes of a deleted message's photo (getOnboardingBucket().file(p).delete()).
const storageDeleteMock = vi.hoisted(() =>
  vi.fn<(objectPath: string, options?: { ignoreNotFound?: boolean }) => Promise<unknown>>(async () => [{}])
);
// When set, the "does another message still show this photo" query rejects.
let sharingQueryError: Error | null = null;

// messages.where('attachment.url', '>=', a).where('attachment.url', '<', b) — the
// messages whose photo URL falls in a range (other messages sharing a photo).
function attachmentUrlQuery(filters: Array<[string, string]>) {
  return {
    where: (_field: string, op: string, value: string) => attachmentUrlQuery([...filters, [op, value]]),
    get: async () => {
      if (sharingQueryError) throw sharingQueryError;
      return {
        docs: Object.entries({ ...MESSAGE_DOCS, ...createdDocs })
          .filter(([, data]) => {
            const url = (data.attachment as { url?: unknown } | undefined)?.url;
            if (typeof url !== 'string') return false;
            return filters.every(([op, value]) => (op === '>=' ? url >= value : op === '<' ? url < value : false));
          })
          .map(([id, data]) => ({ id, data: () => data })),
      };
    },
  };
}

// messages.where('replyTo.messageId', '==', id) — the replies quoting a message.
function messagesWhere(field: string, op: string, messageId: string) {
  if (field === 'attachment.url') return attachmentUrlQuery([[op, messageId]]);
  return {
    get: async () => ({
      docs: Object.entries(MESSAGE_DOCS)
        .filter(([, data]) => (data.replyTo as { messageId?: string } | undefined)?.messageId === messageId)
        .map(([id]) => ({ id, ref: { id } })),
    }),
  };
}

// lastMessageAt as written by the route (server timestamps resolved to now).
const channelLastMessageAt: Record<string, Timestamp> = {};
// users/{uid}/chatReads/{channelId} writes, keyed `${uid}/${channelId}`.
const receipts: Record<string, Record<string, unknown>> = {};
// chatChannels/{c}/pushLog/{messageId}, keyed `${c}/${messageId}`; create() of an
// existing doc rejects like the Admin SDK.
const pushLogs: Record<string, Record<string, unknown>> = {};
function pushLogDoc(key: string) {
  return {
    create: async (data: Record<string, unknown>) => {
      if (key in pushLogs) throw Object.assign(new Error('ALREADY_EXISTS'), { code: 6 });
      pushLogs[key] = { ...data };
    },
    set: async (data: Record<string, unknown>) => {
      pushLogs[key] = { ...pushLogs[key], ...data };
    },
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
  getOnboardingBucket: () => ({
    file: (objectPath: string) => ({
      delete: (options?: { ignoreNotFound?: boolean }) => storageDeleteMock(objectPath, options),
    }),
  }),
  adminDb: {
    collection: (name: string) =>
      name === 'users'
        ? {
            doc: (uid: string) => ({
              __user: uid,
              collection: () => ({
                doc: (channelId: string) => ({
                  set: async (data: Record<string, unknown>) => {
                    receipts[`${uid}/${channelId}`] = data;
                  },
                }),
              }),
            }),
          }
        : {
            doc: (channelId: string) => ({
              id: channelId,
              get: vi.fn(async () => ({
                id: channelId,
                exists: channelId in CHANNEL_DOCS,
                data: () =>
                  CHANNEL_DOCS[channelId] && {
                    ...CHANNEL_DOCS[channelId],
                    ...(channelLastMessageAt[channelId] ? { lastMessageAt: channelLastMessageAt[channelId] } : {}),
                  },
              })),
              set: (data: Record<string, unknown>, options?: { merge?: boolean }) => {
                if ('lastMessageAt' in data) {
                  const value = data.lastMessageAt;
                  if (value instanceof Timestamp) channelLastMessageAt[channelId] = value;
                  else if (FieldValue.delete().isEqual(value as FieldValue)) delete channelLastMessageAt[channelId];
                  else channelLastMessageAt[channelId] = Timestamp.now();
                }
                return setMock(data, options);
              },
              collection: (name: string) =>
                name === 'pushLog'
                  ? { doc: (id: string) => pushLogDoc(`${channelId}/${id}`) }
                  : { doc: messagesDoc, where: messagesWhere, orderBy: messagesOrderBy },
            }),
          },
    getAll: async (...refs: Array<{ __user: string }>) =>
      refs.map((r) => ({ id: r.__user, exists: r.__user in USER_DOCS, data: () => USER_DOCS[r.__user] })),
    // Creates are applied first and a failing one rejects the commit before any
    // other write lands, like an atomic batch.
    batch: () => {
      const creates: Array<() => Promise<unknown>> = [];
      const sets: Array<() => Promise<unknown>> = [];
      return {
        create: (ref: { create: (doc: unknown) => Promise<unknown> }, doc: unknown) => {
          creates.push(() => ref.create(doc));
        },
        set: (ref: { set: (data: unknown, options?: unknown) => Promise<unknown> }, data: unknown, options?: unknown) => {
          sets.push(() => ref.set(data, options));
        },
        update: (ref: { id: string }, data: Record<string, unknown>) => batchUpdates.push({ id: ref.id, data }),
        commit: async () => {
          for (const write of creates) await write();
          for (const write of sets) await write();
        },
      };
    },
    runTransaction: async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        get: (target: { get: () => Promise<unknown> }) => target.get(),
        set: (ref: { set: (data: unknown, options?: unknown) => Promise<unknown> }, data: unknown, options?: unknown) =>
          ref.set(data, options),
        update: (ref: { update: (data: unknown) => Promise<unknown> }, data: unknown) => ref.update(data),
      }),
  },
}));

import { POST, PATCH, DELETE } from './route';
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
  createMock.mockClear();
  createdIds.clear();
  msgUpdateMock.mockClear();
  for (const id of Object.keys(createdDocs)) delete createdDocs[id];
  for (const id of Object.keys(channelLastMessageAt)) delete channelLastMessageAt[id];
  for (const id of Object.keys(receipts)) delete receipts[id];
  for (const id of Object.keys(pushLogs)) delete pushLogs[id];
  batchUpdates.length = 0;
  storageDeleteMock.mockReset();
  storageDeleteMock.mockResolvedValue([{}]);
  sharingQueryError = null;
  sendPushMock.mockClear();
  afterTasks.length = 0;
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;
});

// Drains the tasks the route handed to after(), so push assertions see a settled fan-out.
async function flushAfter() {
  await Promise.all(afterTasks);
}

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

  it('merges lastMessageAt onto the channel doc when a message is sent', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'hi there' }));
    expect(res.status).toBe(200);
    // real-uid is already a member of all-company, so ensureChatChannelMember
    // short-circuits without a channel write — the only channel-level set here is
    // the lastMessageAt bump.
    expect(setMock).toHaveBeenCalledTimes(1);
    const [payload, options] = setMock.mock.calls[0] as unknown as [
      Record<string, unknown>,
      { merge?: boolean } | undefined,
    ];
    expect(payload.lastMessageAt).toBeDefined();
    expect(options?.merge).toBe(true);
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

  it('accepts a valid GIPHY gif attachment', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'all-company',
        attachment: { type: 'gif', url: 'https://media.giphy.com/abc/def.gif' },
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

  it('rejects a gif url that is not on a giphy.com host', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({ channelId: 'all-company', attachment: { type: 'gif', url: 'https://evilgiphy.com/x.gif' } })
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

describe('POST /api/portal/chat/messages (push fan-out)', () => {
  it('pushes the channel name and message to every member except the author', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    // 'managers-extra' lists mgr-1 alongside the author real-uid.
    const res = await POST(req({ channelId: 'managers-extra', text: 'standup in five' }));
    expect(res.status).toBe(200);
    await flushAfter();
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock).toHaveBeenCalledWith('mgr-1', ['tok-mgr'], {
      title: 'Managers',
      body: 'Real User: standup in five',
      url: '/portal/chat?channel=managers-extra',
    }, { urgency: 'high' });
  });

  it('sends no push when the author is the channel’s only member', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'talking to myself' }));
    expect(res.status).toBe(200);
    await flushAfter();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('describes an attachment-only message instead of pushing an empty body', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(
      req({
        channelId: 'managers-extra',
        attachment: { type: 'image', url: imageUrl('managers-extra') },
      })
    );
    expect(res.status).toBe(200);
    await flushAfter();
    expect(sendPushMock.mock.calls[0][2]).toMatchObject({ body: 'Real User sent a photo' });
  });
});

describe('POST /api/portal/chat/messages (idempotent retry)', () => {
  const CLIENT_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
  const OTHER_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7';

  it('stores a keyed send under the author-scoped id', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, messageId: `real-uid_${CLIENT_ID}` });
    expect(addMock).not.toHaveBeenCalled();
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(createMock.mock.calls[0][1]).toMatchObject({ authorId: 'real-uid', text: 'hi' });
  });

  it('answers a repeat of the same key as a success without a second message or push', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    await flushAfter();
    sendPushMock.mockClear();
    setMock.mockClear();
    afterTasks.length = 0;

    const again = await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ success: true, messageId: `real-uid_${CLIENT_ID}`, duplicate: true });
    await flushAfter();
    expect(sendPushMock).not.toHaveBeenCalled();
    expect(setMock).not.toHaveBeenCalledWith(expect.objectContaining({ lastMessageAt: expect.anything() }), {
      merge: true,
    });
    expect(createdIds.size).toBe(1);
  });

  it('commits the message and the lastMessageAt bump together, or neither', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    const stored = createdDocs[`real-uid_${CLIENT_ID}`];
    expect(stored).toBeDefined();
    expect(channelLastMessageAt['managers-extra']).toBeInstanceOf(Timestamp);

    setMock.mockClear();
    createMock.mockRejectedValueOnce(Object.assign(new Error('UNAVAILABLE'), { code: 14 }));
    const failed = await POST(req({ channelId: 'managers-extra', text: 'again', clientMessageId: OTHER_ID }));
    expect(failed.status).toBe(500);
    expect(setMock).not.toHaveBeenCalled();
    expect(afterTasks).toHaveLength(1);
  });

  it('moves the sender’s own read receipt with the send, so their message is never unread to them', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    expect(receipts['real-uid/managers-extra']).toEqual({ lastReadAt: expect.anything() });
  });

  it('records the push result in the push log, not on the message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    await flushAfter();
    expect(pushLogs[`managers-extra/real-uid_${CLIENT_ID}`]).toMatchObject({
      claimedAt: expect.anything(),
      recipients: 1,
      sent: 1,
      failed: 0,
      pruned: 0,
      at: expect.anything(),
    });
    expect(msgUpdateMock).not.toHaveBeenCalled();
    expect(createdDocs[`real-uid_${CLIENT_ID}`]).not.toHaveProperty('push');
  });

  it('lets a repeat finish the bump, receipt and push a lost first attempt never made, once', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    // Stored a minute ago by an attempt that died before its push (and before atomic bumps).
    const id = `real-uid_${CLIENT_ID}`;
    const createdAt = Timestamp.fromMillis(Date.now() - 60_000);
    createdIds.add(id);
    createdDocs[id] = { authorId: 'real-uid', text: 'hi', deletedAt: null, createdAt };
    channelLastMessageAt['managers-extra'] = Timestamp.fromMillis(createdAt.toMillis() - 1000);

    const again = await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    expect(await again.json()).toEqual({ success: true, messageId: id, duplicate: true });
    await flushAfter();
    expect(channelLastMessageAt['managers-extra'].toMillis()).toBe(createdAt.toMillis());
    expect(receipts['real-uid/managers-extra']).toEqual({ lastReadAt: expect.anything() });
    expect(sendPushMock).toHaveBeenCalledTimes(1);
    expect(sendPushMock.mock.calls[0][2]).toMatchObject({ body: 'Real User: hi' });

    afterTasks.length = 0;
    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    await flushAfter();
    expect(sendPushMock).toHaveBeenCalledTimes(1);
  });

  it('never pushes a repeat of a message stored long ago, but still bumps it', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const id = `real-uid_${CLIENT_ID}`;
    const createdAt = Timestamp.fromMillis(Date.now() - 6 * 60_000);
    createdIds.add(id);
    createdDocs[id] = { authorId: 'real-uid', text: 'hi', deletedAt: null, createdAt };
    channelLastMessageAt['managers-extra'] = Timestamp.fromMillis(createdAt.toMillis() - 1000);

    await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    await flushAfter();
    expect(channelLastMessageAt['managers-extra'].toMillis()).toBe(createdAt.toMillis());
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('never pushes a repeat of a message deleted since', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const id = `real-uid_${CLIENT_ID}`;
    createdIds.add(id);
    createdDocs[id] = { authorId: 'real-uid', text: '', deletedAt: { seconds: 1 }, createdAt: Timestamp.now() };
    const again = await POST(req({ channelId: 'managers-extra', text: 'hi', clientMessageId: CLIENT_ID }));
    expect(again.status).toBe(200);
    await flushAfter();
    expect(sendPushMock).not.toHaveBeenCalled();
  });

  it('falls back to a random id when the key is malformed', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await POST(req({ channelId: 'all-company', text: 'hi', clientMessageId: '../../evil' }));
    expect(res.status).toBe(200);
    expect(createMock).not.toHaveBeenCalled();
    expect(addMock).toHaveBeenCalledTimes(1);
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

describe('DELETE /api/portal/chat/messages', () => {
  function deleteReq(body: unknown) {
    return new NextRequest('http://localhost/api/portal/chat/messages', {
      method: 'DELETE',
      body: JSON.stringify(body),
    });
  }

  it('clears the text, attachment and pin of the deleted message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'own-msg' }));
    expect(res.status).toBe(200);
    const [payload, options] = msgSetMock.mock.calls[0];
    expect(payload).toMatchObject({ deletedBy: 'real-uid', text: '', isPinned: false, pinnedAt: null });
    expect(payload).toHaveProperty('attachment');
    expect(payload).toHaveProperty('hasAttachment');
    expect(options?.merge).toBe(true);
  });

  it('replaces the quoted text in replies to the deleted message', async () => {
    mockGate.mockResolvedValue(MODERATOR);
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'others-msg' }));
    expect(res.status).toBe(200);
    expect(batchUpdates).toEqual([{ id: 'reply-to-others', data: { 'replyTo.text': 'Message deleted' } }]);
  });

  it('rolls lastMessageAt back to the newest remaining message when the newest is deleted', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    channelLastMessageAt['all-company'] = Timestamp.fromMillis(2_000_000);
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'own-msg' }));
    expect(res.status).toBe(200);
    expect(channelLastMessageAt['all-company'].toMillis()).toBe(1_000_000);
  });

  it('leaves lastMessageAt alone when a newer message exists', async () => {
    mockGate.mockResolvedValue(MODERATOR);
    channelLastMessageAt['all-company'] = Timestamp.fromMillis(2_000_000);
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'others-msg' }));
    expect(res.status).toBe(200);
    expect(channelLastMessageAt['all-company'].toMillis()).toBe(2_000_000);
    expect(setMock).not.toHaveBeenCalledWith(expect.objectContaining({ lastMessageAt: expect.anything() }), {
      merge: true,
    });
  });

  it('leaves lastMessageAt alone when the newest window holds no standing message', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    channelLastMessageAt['all-company'] = Timestamp.fromMillis(2_000_000);
    MESSAGE_DOCS['others-msg'].deletedAt = { seconds: 1 };
    for (let i = 0; i < 25; i++) {
      createdDocs[`gone-${i}`] = { text: '', deletedAt: { seconds: 1 }, createdAt: Timestamp.fromMillis(2_000_001 + i) };
    }
    try {
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'own-msg' }));
      expect(res.status).toBe(200);
      expect(channelLastMessageAt['all-company'].toMillis()).toBe(2_000_000);
    } finally {
      MESSAGE_DOCS['others-msg'].deletedAt = null;
    }
  });

  it('clears lastMessageAt when no message is left standing', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    channelLastMessageAt['all-company'] = Timestamp.fromMillis(2_000_000);
    MESSAGE_DOCS['others-msg'].deletedAt = { seconds: 1 };
    try {
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'own-msg' }));
      expect(res.status).toBe(200);
      expect(channelLastMessageAt['all-company']).toBeUndefined();
    } finally {
      MESSAGE_DOCS['others-msg'].deletedAt = null;
    }
  });
});

describe('DELETE /api/portal/chat/messages (photo in Storage)', () => {
  function deleteReq(body: unknown) {
    return new NextRequest('http://localhost/api/portal/chat/messages', {
      method: 'DELETE',
      body: JSON.stringify(body),
    });
  }

  // An own photo message in all-company (older than the fixtures, so the
  // lastMessageAt logic is not involved).
  function storePhoto(id: string, url: string, extra: Record<string, unknown> = {}) {
    createdDocs[id] = {
      authorId: 'real-uid',
      authorName: 'Real User',
      text: '',
      attachment: { type: 'image', url, width: 800, height: 600, contentType: 'image/png' },
      hasAttachment: true,
      deletedAt: null,
      createdAt: Timestamp.fromMillis(500_000),
      ...extra,
    };
  }

  it("deletes the photo's object from the channel folder after the doc is scrubbed", async () => {
    mockGate.mockResolvedValue(VERIFIED);
    storePhoto('photo-msg', imageUrl('all-company', 'photo-1.png'));
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
    expect(res.status).toBe(200);
    expect(storageDeleteMock).toHaveBeenCalledTimes(1);
    expect(storageDeleteMock).toHaveBeenCalledWith('chat/all-company/photo-1.png', { ignoreNotFound: true });
    expect(msgSetMock.mock.invocationCallOrder[0]).toBeLessThan(storageDeleteMock.mock.invocationCallOrder[0]);
  });

  it('never deletes an object outside this bucket and channel folder', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const outside = [
      imageUrl('managers-extra', 'other-channel.png'),
      imageUrl('all-company', '../managers-extra/x.png'),
      imageUrl('all-company', 'nested/x.png'),
      imageUrl('all-company', '.hidden'),
      imageUrl('all-company', 'x.png').replace(BUCKET, 'other-bucket.appspot.com'),
      `https://evil.example/v0/b/${BUCKET}/o/${encodeURIComponent('chat/all-company/x.png')}?alt=media`,
      'not a url',
    ];
    for (const [i, url] of outside.entries()) {
      storePhoto(`outside-${i}`, url);
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: `outside-${i}` }));
      expect(res.status).toBe(200);
    }
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it('treats a missing object (404) as deleted', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    storageDeleteMock.mockRejectedValue(Object.assign(new Error('No such object'), { code: 404 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      storePhoto('photo-msg', imageUrl('all-company', 'gone.png'));
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
      expect(res.status).toBe(200);
      expect(storageDeleteMock).toHaveBeenCalledTimes(1);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('still succeeds when Storage fails, logging no URL or token', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    storageDeleteMock.mockRejectedValue(Object.assign(new Error(`boom ${imageUrl('all-company', 'p.png')}`), { code: 503 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      storePhoto('photo-msg', imageUrl('all-company', 'p.png'));
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ success: true });
      expect(msgSetMock).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledTimes(1);
      const logged = errorSpy.mock.calls.flat().map(String).join(' ');
      expect(logged).toContain('503');
      expect(logged).not.toMatch(/https?:|token|firebasestorage|p\.png/);
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('makes no Storage call for a message without a photo, or with a GIF', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    expect((await DELETE(deleteReq({ channelId: 'all-company', messageId: 'own-msg' }))).status).toBe(200);
    createdDocs['gif-msg'] = {
      authorId: 'real-uid',
      text: '',
      attachment: { type: 'gif', url: 'https://media.giphy.com/x.gif' },
      hasAttachment: true,
      deletedAt: null,
    };
    expect((await DELETE(deleteReq({ channelId: 'all-company', messageId: 'gif-msg' }))).status).toBe(200);
    expect(storageDeleteMock).not.toHaveBeenCalled();
  });

  it('keeps the object while another standing message still shows it', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const url = imageUrl('all-company', 'shared.png');
    storePhoto('photo-msg', url);
    storePhoto('photo-copy', url.replace('token=tok', 'token=other'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
      expect(res.status).toBe(200);
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(warnSpy.mock.calls.flat().map(String).join(' ')).not.toMatch(/https?:|token/);
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('deletes a shared object once the other message is deleted too', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    const url = imageUrl('all-company', 'shared.png');
    storePhoto('photo-msg', url);
    storePhoto('photo-copy', url, { deletedAt: { seconds: 1 } });
    // A different object whose name merely starts the same is not a share.
    storePhoto('photo-near', imageUrl('all-company', 'shared.png2'));
    const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
    expect(res.status).toBe(200);
    expect(storageDeleteMock).toHaveBeenCalledWith('chat/all-company/shared.png', { ignoreNotFound: true });
  });

  it('keeps the object (and still succeeds) when the share check fails', async () => {
    mockGate.mockResolvedValue(VERIFIED);
    sharingQueryError = Object.assign(new Error('unavailable'), { code: 14 });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      storePhoto('photo-msg', imageUrl('all-company', 'p.png'));
      const res = await DELETE(deleteReq({ channelId: 'all-company', messageId: 'photo-msg' }));
      expect(res.status).toBe(200);
      expect(storageDeleteMock).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledTimes(1);
    } finally {
      errorSpy.mockRestore();
    }
  });
});
