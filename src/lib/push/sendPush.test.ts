import { beforeEach, describe, expect, it, vi } from 'vitest';

const { sendEachForMulticast } = vi.hoisted(() => ({
  sendEachForMulticast: vi.fn(),
}));

vi.mock('@/lib/firebase/admin', () => ({
  app: {},
  adminDb: {
    collection: (name: string) => {
      if (name === 'users') {
        return {
          doc: () => ({
            get: vi.fn().mockResolvedValue({
              data: () => ({ pushTokens: ['tok1'] }),
            }),
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

import { sendPushToTokens, sendPushToUser } from './sendPush';

beforeEach(() => {
  sendEachForMulticast.mockReset();
  sendEachForMulticast.mockResolvedValue({ responses: [{ success: true }] });
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
    expect(result).toEqual({ delivered: 1, failed: 1 });
    expect(sendEachForMulticast.mock.calls[0][0].tokens).toEqual(['tok1', 'tok2']);
  });

  it('sends nothing when the user has no devices', async () => {
    expect(await sendPushToTokens('user-1', [], { title: 'T', body: 'B' })).toEqual({ delivered: 0, failed: 0 });
    expect(sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('never throws: an FCM error counts every device as failed', async () => {
    sendEachForMulticast.mockRejectedValue(new Error('down'));
    expect(await sendPushToTokens('user-1', ['tok1'], { title: 'T', body: 'B' })).toEqual({ delivered: 0, failed: 1 });
  });
});
