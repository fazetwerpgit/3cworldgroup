import { beforeEach, describe, expect, it, vi } from 'vitest';

const pushMock = vi.hoisted(() => vi.fn(async () => undefined));
const emailMock = vi.hoisted(() => vi.fn(async () => undefined));
const slotMock = vi.hoisted(() => vi.fn(async () => ({ send: true, folded: 0 })));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: () => ({ doc: (uid: string) => ({ get: async () => ({ exists: true, data: () => ({ email: `${uid}@3c.test` }) }) }) }),
  },
}));
vi.mock('@/lib/alerts/alertTasks', () => ({ getManagementUserIds: async () => ['owner-1', 'admin-2', 'ops-3'] }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: pushMock }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: emailMock }));
vi.mock('@/lib/email/userEmail', () => ({
  emailFromUserDoc: (snap: { data: () => { email: string } }) => snap.data().email,
}));
vi.mock('@/lib/email/templates', () => ({
  appBaseUrl: () => 'https://www.3cworldgroup.com',
  managerAlertEmail: (alert: { title: string; message: string }) => ({ subject: alert.title, html: alert.message }),
}));
vi.mock('./moderationLimits', () => ({ takeAlertSlot: slotMock }));

import { notifyChatModerators, withFoldedCount } from './moderation';

const alert = { title: 'Chat block', message: 'Ana blocked Cole in team chat.', link: '/portal/admin/chat-reports', actorId: 'ana' };

beforeEach(() => {
  pushMock.mockClear();
  emailMock.mockClear();
  slotMock.mockReset();
  slotMock.mockResolvedValue({ send: true, folded: 0 });
});

describe('notifyChatModerators', () => {
  it('never alerts an excluded person', async () => {
    await notifyChatModerators({ ...alert, excludeUids: ['admin-2'] });
    expect(pushMock.mock.calls.map((call) => (call as unknown[])[0])).toEqual(['owner-1', 'ops-3']);
    expect(emailMock).toHaveBeenCalledTimes(2);
  });

  it('sends nothing while the actor is throttled, and folds the count into the next alert', async () => {
    slotMock.mockResolvedValueOnce({ send: false, folded: 0 });
    await notifyChatModerators(alert);
    expect(pushMock).not.toHaveBeenCalled();
    expect(emailMock).not.toHaveBeenCalled();

    slotMock.mockResolvedValueOnce({ send: true, folded: 3 });
    await notifyChatModerators(alert);
    expect(slotMock).toHaveBeenCalledWith('ana');
    expect(pushMock).toHaveBeenCalledWith('owner-1', expect.objectContaining({ body: withFoldedCount(alert.message, 3) }));
  });

  it('words the folded count', () => {
    expect(withFoldedCount('x.', 0)).toBe('x.');
    expect(withFoldedCount('x.', 2)).toBe('x. (2 more from this person since the last alert.)');
  });
});
