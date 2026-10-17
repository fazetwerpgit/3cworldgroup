import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEachForMulticast, userSet, userData, unreadChatBadge } = vi.hoisted(() => ({
  unreadChatBadge: vi.fn(),
  sendEachForMulticast: vi.fn(),
  userSet: vi.fn(),
  userData: { current: { pushTokens: ['tok1'] } as Record<string, unknown> },
}));

vi.mock('@/lib/firebase/admin', () => ({
  app: {},
  adminDb: {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: vi.fn(async () => ({
              data: () => userData.current,
            })),
            set: userSet,
          }),
        };
      }
      return { doc: vi.fn() };
    },
  },
}));

vi.mock('firebase-admin/messaging', () => ({
  getMessaging: () => ({ sendEachForMulticast }),
}));

vi.mock('firebase-admin/firestore', () => ({
  FieldValue: { arrayRemove: (...items: unknown[]) => ({ __arrayRemove: items }) },
}));

vi.mock('./unreadBadge', () => ({ unreadChatBadge }));

import { pushTargetsOf, sendPushToTokens, sendPushToUser } from './sendPush';

type Multicast = {
  tokens: string[];
  data: Record<string, string>;
  notification?: { title: string; body: string };
  apns?: { headers?: Record<string, string>; payload: { aps: Record<string, unknown> } };
  webpush?: unknown;
};

beforeEach(() => {
  sendEachForMulticast.mockReset();
  userSet.mockReset();
  userSet.mockResolvedValue(undefined);
  userData.current = { pushTokens: ['tok1'] };
  unreadChatBadge.mockReset();
  unreadChatBadge.mockResolvedValue(null);
  // One response per token, all accepted.
  sendEachForMulticast.mockImplementation(async (m: Multicast) => ({ responses: m.tokens.map(() => ({ success: true })) }));
});

describe('sendPushToUser', () => {
  it('sends a data-only message with the supplied URL and registered tokens', async () => {
    await sendPushToUser('user-1', {
      title: 'New message',
      body: 'Hello',
      url: '/portal/chat',
    });

    const message = sendEachForMulticast.mock.calls[0][0] as {
      tokens: string[];
      notification?: unknown;
      webpush?: unknown;
      data: Record<string, string>;
    };

    // A notification plus the SW's onBackgroundMessage showNotification causes double display on iOS.
    expect(message).not.toHaveProperty('notification');
    expect(message).not.toHaveProperty('webpush');
    expect(message.tokens).toEqual(['tok1']);
    expect(message.data).toEqual({
      title: 'New message',
      body: 'Hello',
      url: '/portal/chat',
    });
    expect(typeof message.data.title).toBe('string');
    expect(typeof message.data.body).toBe('string');
    expect(typeof message.data.url).toBe('string');
  });

  it('defaults the data URL to the portal dashboard', async () => {
    await sendPushToUser('user-1', { title: 'Title', body: 'Body' });

    const message = sendEachForMulticast.mock.calls[0][0] as {
      data: Record<string, string>;
    };

    expect(message.data.url).toBe('/portal/dashboard');
  });
});

describe('sendPushToTokens', () => {
  it('reports how many devices FCM accepted', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: false, error: { code: 'messaging/internal-error' } }],
    });
    const result = await sendPushToTokens('user-1', ['tok1', 'tok2'], { title: 'T', body: 'B', url: '/portal' });
    expect(result).toEqual({ delivered: 1, failed: 1, pruned: 0 });
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['tok1', 'tok2']);
  });

  it('sends nothing when the user has no devices', async () => {
    expect(await sendPushToTokens('user-1', [], { title: 'T', body: 'B' })).toEqual({ delivered: 0, failed: 0, pruned: 0 });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('never throws: an FCM error counts every device as failed', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('down'));
    expect(await sendPushToTokens('user-1', ['tok1'], { title: 'T', body: 'B' })).toEqual({ delivered: 0, failed: 1, pruned: 0 });
  });

  it('counts dead tokens it pruned', async () => {
    sendEachForMulticast.mockResolvedValue({
      responses: [{ success: true }, { success: false, error: { code: 'messaging/registration-token-not-registered' } }],
    });
    const result = await sendPushToTokens('user-1', ['tok1', 'tok2'], { title: 'T', body: 'B' });
    expect(result).toEqual({ delivered: 1, failed: 1, pruned: 1 });
  });

  it('sets the Web Push Urgency header only when asked', async () => {
    await sendPushToTokens('user-1', ['tok1'], { title: 'T', body: 'B' }, { urgency: 'high' });
    expect(sendEachForMulticast.mock.calls[0][0].webpush).toEqual({ headers: { Urgency: 'high' } });

    await sendPushToTokens('user-1', ['tok1'], { title: 'T', body: 'B' });
    expect(sendEachForMulticast.mock.calls[1][0]).not.toHaveProperty('webpush');
  });
});

describe('native (3C iOS app) tokens', () => {
  const payload = { title: 'New message', body: 'Hi', url: '/portal/chat' };

  it('reads web and platform-tagged native tokens from a users doc', () => {
    expect(
      pushTargetsOf({
        pushTokens: ['w1', '', 3],
        nativePushTokens: [
          { token: 'n1', platform: 'ios-native' },
          { token: 'n2', platform: 'android' },
          'bare-string',
          { platform: 'ios-native' },
        ],
      })
    ).toEqual({ web: ['w1'], native: ['n1'] });
    expect(pushTargetsOf(undefined)).toEqual({ web: [], native: [] });
  });

  it('sends web tokens data-only and native tokens with notification + apns, separately', async () => {
    const result = await sendPushToTokens('user-1', { web: ['w1', 'w2'], native: ['n1'] }, payload);
    expect(result).toEqual({ delivered: 3, failed: 0, pruned: 0 });
    expect(sendEachForMulticast).toHaveBeenCalledTimes(2);
    const calls = sendEachForMulticast.mock.calls.map((c) => c[0] as Multicast);
    const web = calls.find((m) => m.tokens.includes('w1'))!;
    const native = calls.find((m) => m.tokens.includes('n1'))!;

    // Web: byte-for-byte the message it always was.
    expect(web).toEqual({ tokens: ['w1', 'w2'], data: { title: 'New message', body: 'Hi', url: '/portal/chat' } });

    // Native: iOS shows it itself; data.url is the deep link.
    expect(native.tokens).toEqual(['n1']);
    expect(native.notification).toEqual({ title: 'New message', body: 'Hi' });
    expect(native.data).toEqual({ title: 'New message', body: 'Hi', url: '/portal/chat' });
    expect(native.apns).toEqual({ payload: { aps: { sound: 'default', badge: 1 } } });
    expect(native).not.toHaveProperty('webpush');
  });

  it('native badge is the recipient unread chat count when it can be read', async () => {
    unreadChatBadge.mockResolvedValue(4);
    await sendPushToTokens('user-1', { web: [], native: ['n1'] }, payload);
    expect(unreadChatBadge).toHaveBeenCalledWith(expect.anything(), 'user-1');
    expect((sendEachForMulticast.mock.calls[0][0] as Multicast).apns!.payload.aps.badge).toBe(4);
  });

  it('a zero unread count sends badge 0 (clears the icon)', async () => {
    unreadChatBadge.mockResolvedValue(0);
    await sendPushToTokens('user-1', { web: [], native: ['n1'] }, payload);
    expect((sendEachForMulticast.mock.calls[0][0] as Multicast).apns!.payload.aps.badge).toBe(0);
  });

  it('web-only recipients never pay for the unread count', async () => {
    await sendPushToTokens('user-1', { web: ['w1'], native: [] }, payload);
    expect(unreadChatBadge).not.toHaveBeenCalled();
  });

  it('a web-only user sends exactly one data-only multicast (unchanged behavior)', async () => {
    await sendPushToUser('user-1', payload);
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect(sendEachForMulticast.mock.calls[0][0]).toEqual({
      tokens: ['tok1'],
      data: { title: 'New message', body: 'Hi', url: '/portal/chat' },
    });
  });

  it('sendPushToUser reaches native tokens on the users doc', async () => {
    userData.current = { pushTokens: [], nativePushTokens: [{ token: 'n1', platform: 'ios-native' }] };
    await sendPushToUser('user-1', payload);
    expect(sendEachForMulticast).toHaveBeenCalledTimes(1);
    expect((sendEachForMulticast.mock.calls[0][0] as Multicast).apns).toBeDefined();
  });

  it('high urgency maps to APNs priority 10 for native and the Urgency header for web', async () => {
    await sendPushToTokens('user-1', { web: ['w1'], native: ['n1'] }, payload, { urgency: 'high' });
    const calls = sendEachForMulticast.mock.calls.map((c) => c[0] as Multicast);
    expect(calls.find((m) => m.tokens.includes('w1'))!.webpush).toEqual({ headers: { Urgency: 'high' } });
    expect(calls.find((m) => m.tokens.includes('n1'))!.apns!.headers).toEqual({ 'apns-priority': '10' });
  });

  it('prunes dead native tokens from nativePushTokens and dead web tokens from pushTokens', async () => {
    sendEachForMulticast.mockImplementation(async (m: Multicast) => ({
      responses: m.tokens.map((t) =>
        t === 'w-dead' || t === 'n-dead'
          ? { success: false, error: { code: 'messaging/registration-token-not-registered' } }
          : { success: true }
      ),
    }));
    const result = await sendPushToTokens('user-1', { web: ['w1', 'w-dead'], native: ['n-dead', 'n1'] }, payload);
    expect(result).toEqual({ delivered: 2, failed: 2, pruned: 2 });
    expect(userSet).toHaveBeenCalledWith(
      {
        pushTokens: { __arrayRemove: ['w-dead'] },
        nativePushTokens: { __arrayRemove: [{ token: 'n-dead', platform: 'ios-native' }] },
      },
      { merge: true }
    );
  });

  it('only touches the native list when only native tokens died', async () => {
    sendEachForMulticast.mockImplementation(async (m: Multicast) => ({
      responses: m.tokens.map(() => ({ success: false, error: { code: 'messaging/invalid-argument' } })),
    }));
    await sendPushToTokens('user-1', { web: [], native: ['n1'] }, payload);
    expect(userSet).toHaveBeenCalledWith(
      { nativePushTokens: { __arrayRemove: [{ token: 'n1', platform: 'ios-native' }] } },
      { merge: true }
    );
  });

  it('an APNs-side failure does not lose the web count', async () => {
    sendEachForMulticast.mockImplementation(async (m: Multicast) => {
      if (m.apns) throw new Error('apns down');
      return { responses: m.tokens.map(() => ({ success: true })) };
    });
    expect(await sendPushToTokens('user-1', { web: ['w1'], native: ['n1'] }, payload)).toEqual({
      delivered: 1,
      failed: 1,
      pruned: 0,
    });
  });
});
