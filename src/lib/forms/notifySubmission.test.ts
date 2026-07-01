import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable adminDb mock: collection('formAlerts').doc(k).get() and
// collection('users').get() and collection('notifications').add(...).
const alertDocGet = vi.fn();
const usersGet = vi.fn();
const notifAdd = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'n1' }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'formAlerts') return { doc: () => ({ get: alertDocGet }) };
      if (name === 'users') return { get: usersGet };
      if (name === 'notifications') return { add: notifAdd };
      return { get: vi.fn() };
    },
  },
}));

import { notifySubmission, FORM_ALERTS } from './notifySubmission';

function usersSnapshot(users: Array<{ id: string; role?: string; fieldRole?: string }>) {
  return { docs: users.map((u) => ({ id: u.id, data: () => ({ role: u.role, fieldRole: u.fieldRole }) })) };
}

beforeEach(() => {
  alertDocGet.mockReset();
  usersGet.mockReset();
  notifAdd.mockClear();
});

describe('notifySubmission', () => {
  it('notifies only admin + operations users', async () => {
    alertDocGet.mockResolvedValue({ exists: false }); // default on
    usersGet.mockResolvedValue(
      usersSnapshot([
        { id: 'admin1', role: 'admin' },
        { id: 'ops1', role: 'operations' },
        { id: 'rep1', fieldRole: 'entry_rep' },
        { id: 'mgr1', fieldRole: 'l1_manager' },
      ])
    );
    await notifySubmission('payroll-dispute', 'Rep One');
    expect(notifAdd).toHaveBeenCalledTimes(2);
    const targetedUids = notifAdd.mock.calls
      .map((c) => (c[0] as unknown as { userId: string }).userId)
      .sort();
    expect(targetedUids).toEqual(['admin1', 'ops1']);
  });

  it('deep-links the notification to the form review page', async () => {
    alertDocGet.mockResolvedValue({ exists: false });
    usersGet.mockResolvedValue(usersSnapshot([{ id: 'admin1', role: 'admin' }]));
    await notifySubmission('leads-request', 'Rep One');
    const doc = notifAdd.mock.calls[0][0] as unknown as { link: string };
    expect(doc.link).toBe(FORM_ALERTS['leads-request'].reviewLink);
  });

  it('sends nothing when the form alert is toggled off', async () => {
    alertDocGet.mockResolvedValue({ exists: true, data: () => ({ enabled: false }) });
    usersGet.mockResolvedValue(usersSnapshot([{ id: 'admin1', role: 'admin' }]));
    await notifySubmission('fiber-report', 'Rep One');
    expect(notifAdd).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown form key', async () => {
    await notifySubmission('not-a-form', 'Rep One');
    expect(notifAdd).not.toHaveBeenCalled();
  });
});
