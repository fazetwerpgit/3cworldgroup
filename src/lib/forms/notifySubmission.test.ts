import { describe, it, expect, vi, beforeEach } from 'vitest';

// Build a chainable adminDb mock: collection('formAlerts').doc(k).get() and
// collection('users').get() and collection('notifications').add(...).
const alertDocGet = vi.fn();
const usersGet = vi.fn();
const userDocGet = vi.fn();
const userWheres: Array<{ field: string; op: string; values: string[] }> = [];
const notifAdd = vi.fn(async (_doc: Record<string, unknown>) => ({ id: 'n1' }));
const sendEmailMock = vi.fn(async (_args: Record<string, unknown>) => ({ ok: true }));

vi.mock('@/lib/firebase/admin', () => ({
  adminDb: {
    collection: (name: string) => {
      if (name === 'formAlerts') return { doc: () => ({ get: alertDocGet }) };
      // Only a where('role','in',...) read exists: a whole-collection get() would
      // throw here. The mock applies the filter like Firestore does.
      if (name === 'users') return {
        where: (field: string, op: string, values: string[]) => ({
          get: async () => {
            userWheres.push({ field, op, values });
            const snap = await usersGet();
            return { docs: snap.docs.filter((d: { data: () => Record<string, unknown> }) => op === 'in' && values.includes(d.data()[field] as string)) };
          },
        }),
        doc: (id: string) => ({ get: () => userDocGet(id) }),
      };
      if (name === 'notifications') return { add: notifAdd };
      return { get: vi.fn() };
    },
  },
}));

vi.mock('@/lib/email/sendEmail', () => ({
  sendEmail: (args: Record<string, unknown>) => sendEmailMock(args),
}));

import { notifySubmission, FORM_ALERTS } from './notifySubmission';

type MockUser = { id: string; role?: string; fieldRole?: string; status?: string; email?: string; Email?: string };

function usersSnapshot(users: MockUser[]) {
  // collection('users').get() returns the list; collection('users').doc(id).get()
  // returns the same doc via a Firestore-style snapshot with .get(field).
  userDocGet.mockImplementation(async (id: string) => {
    const u = users.find((x) => x.id === id);
    return { get: (field: string) => (u as Record<string, unknown> | undefined)?.[field] };
  });
  return {
    docs: users.map((u) => ({
      id: u.id,
      data: () => ({ role: u.role, fieldRole: u.fieldRole, status: u.status ?? 'active' }),
      get: (field: string) => (u as Record<string, unknown>)[field],
    })),
  };
}

beforeEach(() => {
  alertDocGet.mockReset();
  usersGet.mockReset();
  userDocGet.mockReset();
  notifAdd.mockClear();
  sendEmailMock.mockClear();
  userWheres.length = 0;
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

  it('skips deactivated management users for bells and emails', async () => {
    alertDocGet.mockResolvedValue({ exists: false });
    usersGet.mockResolvedValue(
      usersSnapshot([
        { id: 'ops1', role: 'operations', email: 'ops@x.com' },
        { id: 'ops2', role: 'operations', status: 'inactive', email: 'gone@x.com' },
      ])
    );
    await notifySubmission('fiber-report', 'Rep One');
    expect(notifAdd.mock.calls.map((c) => c[0].userId)).toEqual(['ops1']);
    expect(sendEmailMock.mock.calls.map((c) => c[0].to)).toEqual(['ops@x.com']);
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

  it('reads users with a targeted management-role query, and no per-user doc reads for email', async () => {
    alertDocGet.mockResolvedValue({ exists: false });
    usersGet.mockResolvedValue(usersSnapshot([{ id: 'admin1', role: 'admin', email: 'a@x.com' }]));
    await notifySubmission('application', 'New Recruit');
    expect(userWheres).toEqual([{ field: 'role', op: 'in', values: ['admin', 'operations', 'owner'] }]);
    expect(userDocGet).not.toHaveBeenCalled();
    expect(sendEmailMock.mock.calls.map((c) => c[0].to)).toEqual(['a@x.com']);
  });

  it('alerts nobody (no bell, no email, no reads) for a demo account submission', async () => {
    alertDocGet.mockResolvedValue({ exists: false });
    usersGet.mockResolvedValue(usersSnapshot([{ id: 'owner1', role: 'owner', email: 'o@x.com' }]));
    await notifySubmission('payroll-dispute', 'Sam Demo', { demoAccount: true });
    expect(notifAdd).not.toHaveBeenCalled();
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(usersGet).not.toHaveBeenCalled();
  });

  it('does nothing for an unknown form key', async () => {
    await notifySubmission('not-a-form', 'Rep One');
    expect(notifAdd).not.toHaveBeenCalled();
  });
});
