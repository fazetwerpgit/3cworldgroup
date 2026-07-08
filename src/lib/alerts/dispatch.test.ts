import { describe, it, expect, vi, beforeEach } from 'vitest';

const { createNotificationMock, sendEmailMock, sendPushMock, getMock } = vi.hoisted(() => ({
  createNotificationMock: vi.fn(async () => 'n1'),
  sendEmailMock: vi.fn(async () => ({ ok: true })),
  sendPushMock: vi.fn(async () => undefined),
  getMock: vi.fn(async () => ({ get: (f: string) => (f === 'email' ? 'rep@x.com' : undefined) })),
}));

vi.mock('@/lib/notifications/createNotification', () => ({ createNotification: createNotificationMock }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: sendEmailMock }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: sendPushMock }));
vi.mock('@/lib/firebase/admin', () => ({ adminDb: { doc: vi.fn(() => ({ get: getMock })) } }));

import { dispatchToUser } from './dispatch';

beforeEach(() => {
  createNotificationMock.mockClear();
  sendEmailMock.mockClear();
  sendPushMock.mockClear();
});

describe('dispatchToUser', () => {
  it('sends in-app + push always, email when content provided', async () => {
    await dispatchToUser({
      userId: 'u1',
      type: 'onboarding_nudge',
      title: 'T',
      message: 'M',
      link: '/portal/onboarding',
      email: { subject: 's', htmlBody: 'h', textBody: 't' },
    });
    expect(createNotificationMock).toHaveBeenCalledOnce();
    expect(sendPushMock).toHaveBeenCalledWith('u1', { title: 'T', body: 'M', url: '/portal/onboarding' });
    expect(sendEmailMock).toHaveBeenCalledWith(expect.objectContaining({ to: 'rep@x.com', subject: 's' }));
  });

  it('does not reject when push throws', async () => {
    sendPushMock.mockRejectedValueOnce(new Error('fcm down'));
    await expect(
      dispatchToUser({ userId: 'u1', type: 'system', title: 'T', message: 'M' })
    ).resolves.toBeUndefined();
    expect(createNotificationMock).toHaveBeenCalledOnce();
  });
});
