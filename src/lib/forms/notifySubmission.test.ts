import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable adminDb mock: collection('formAlerts').doc(k).get() and
// collection('users').get() and collection('notifications').add(...).
const alertDocGet = vi.fn();
const usersGet = vi.fn();
const userDocGet = vi.fn();
const notifAdd = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'n1' }));
const sendEmailMock = vi.fn(async (_args: Record<string, unknown>) => ({ ok: true }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'formAlerts') return { doc: () => ({ get: alertDocGet }) };
      if (name === 'users') return { get: usersGet, doc: (id: string) => ({ get: () => userDocGet(id) }) };
      if (name === 'notifications') return { add: notifAdd };
      return { get: vi.fn() };
    },
  },
}));

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: (args: Record<string, unknown>) => sendEmailMock(args),
}));

import { notifySubmission, FORM_ALERTS } from './notifySubmission';

type MockUser = { id: string; role?: string; fieldRole?: string; email?: string; Email?: string };

function usersSnapshot(users: MockUser[]) {
  // collection('users').get() returns the list; collection('users').doc(id).get()
  // returns the same doc via a Firestore-style snapshot with .get(field).
  userDocGet.mockImplementation(async (id: string) => {
    const u = users.find((x) => x.id === id);
    return { get: (field: string) => (u as Record<string, unknown> | undefined)?.[field] };
  });
  return { docs: users.map((u) => ({ id: u.id, data: () => ({ role: u.role, fieldRole: u.fieldRole }) })) };
}

beforeEach(() => {
  alertDocGet.mockReset();
  usersGet.mockReset();
  userDocGet.mockReset();
  notifAdd.mockClear();
  sendEmailMock.mockClear();
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

  it('emails every management user, including legacy docs storing Email (capital E)', async () => {
    alertDocGet.mockResolvedValue({ exists: false });
    usersGet.mockResolvedValue(
      usersSnapshot([
        { id: 'owner1', role: 'owner', Email: 'jmyers@3cworldgroup.com' },
        { id: 'owner2', role: 'owner', email: 'jeremy@example.com' },
      ])
    );
    await notifySubmission('application', 'New Recruit (Dallas)');
    const to = sendEmailMock.mock.calls.map((c) => (c[0] as { to: string }).to).sort();
    expect(to).toEqual(['jeremy@example.com', 'jmyers@3cworldgroup.com']);
  });

  it('does nothing for an unknown form key', async () => {
    await notifySubmission('not-a-form', 'Rep One');
    expect(notifAdd).not.toHaveBeenCalled();
  });
});
