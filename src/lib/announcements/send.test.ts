import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Firestore } from 'firebase-admin/firestore';

// No real FCM or Firestore here: sendPushToTokens is mocked and the database is
// an in-memory fake with the few calls the send layer makes.
const { sendPushToTokens } = vi.hoisted(() => ({ sendPushToTokens: vi.fn() }));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToTokens }));

import { announcementRecipients, runDueAnnouncements, sendAnnouncement, sendTestToSelf } from './send';

type Doc = Record<string, unknown>;

function fakeDb(seed: Record<string, Record<string, Doc>>) {
  const store = new Map<string, Map<string, Doc>>();
  for (const [name, docs] of Object.entries(seed)) store.set(name, new Map(Object.entries(docs)));
  const coll = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    return store.get(name)!;
  };
  const snapshot = (name: string, id: string) => {
    const data = coll(name).get(id);
    return { id, exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
  };
  const ref = (name: string, id: string) => ({
    name,
    id,
    get: async () => snapshot(name, id),
    update: async (patch: Doc) => {
      coll(name).set(id, { ...coll(name).get(id), ...patch });
    },
  });
  // Transactions run one at a time, like Firestore's retry-until-serialisable.
  let chain: Promise<unknown> = Promise.resolve();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ref(name, id),
      where: (field: string, op: string, value: unknown) => ({
        get: async () => {
          expect(op).toBe('==');
          const docs = [...coll(name).keys()]
            .filter((id) => coll(name).get(id)?.[field] === value)
            .map((id) => snapshot(name, id));
          return { docs };
        },
      }),
    }),
    runTransaction: <T,>(fn: (tx: unknown) => Promise<T>) => {
      const run = chain.then(async () => {
        const writes: Array<() => void> = [];
        const tx = {
          get: async (r: ReturnType<typeof ref>) => snapshot(r.name, r.id),
          update: (r: ReturnType<typeof ref>, patch: Doc) =>
            writes.push(() => coll(r.name).set(r.id, { ...coll(r.name).get(r.id), ...patch })),
        };
        const result = await fn(tx);
        writes.forEach((write) => write());
        return result;
      });
      chain = run.catch(() => undefined);
      return run;
    },
  };
  return { db: db as unknown as Firestore, store };
}

const NOW = new Date('2026-09-24T13:05:00Z');
const past = new Date('2026-09-24T13:00:00Z');
const future = new Date('2026-09-25T13:00:00Z');

function seed(announcements: Record<string, Doc>) {
  return fakeDb({
    users: {
      rep1: { status: 'active', role: 'rep', pushTokens: ['r1a', 'r1b'] },
      admin1: { status: 'active', role: 'admin', pushTokens: ['a1'] },
      owner1: { status: 'active', role: 'owner', pushTokens: ['o1'] },
      nodevice: { status: 'active', role: 'rep', pushTokens: [] },
      pending1: { status: 'pending', role: 'rep', pushTokens: ['p1'] },
      gone1: { status: 'inactive', role: 'rep', pushTokens: ['g1'] },
    },
    announcements,
  });
}

beforeEach(() => {
  sendPushToTokens.mockReset();
  sendPushToTokens.mockImplementation(async (_uid: string, tokens: string[]) => ({
    delivered: tokens.length,
    failed: 0,
  }));
});

describe('announcementRecipients', () => {
  it('is every active user, any role, with a registered device', async () => {
    const { db } = seed({});
    const recipients = await announcementRecipients(db);
    expect(recipients.map((r) => r.uid).sort()).toEqual(['admin1', 'owner1', 'rep1']);
    expect(recipients.find((r) => r.uid === 'rep1')?.tokens).toEqual(['r1a', 'r1b']);
  });
});

describe('runDueAnnouncements', () => {
  it('sends only scheduled announcements that are due', async () => {
    const { db, store } = seed({
      due: { title: 'Auto-fill', body: 'Try it', status: 'scheduled', sendAt: past },
      later: { title: 'Later', body: 'x', status: 'scheduled', sendAt: future },
      gone: { title: 'Cancelled', body: 'x', status: 'cancelled', sendAt: past },
      done: { title: 'Done', body: 'x', status: 'sent', sendAt: past },
    });

    const summary = await runDueAnnouncements({ db, now: NOW });

    expect(summary.sent).toEqual(['due']);
    expect(store.get('announcements')!.get('due')).toMatchObject({ status: 'sent', sentCount: 3, failedCount: 0 });
    expect(store.get('announcements')!.get('later')?.status).toBe('scheduled');
    expect(store.get('announcements')!.get('gone')?.status).toBe('cancelled');
    // One push per recipient, the message and the portal deep link.
    expect(sendPushToTokens).toHaveBeenCalledTimes(3);
    expect(sendPushToTokens.mock.calls.map((c) => c[0]).sort()).toEqual(['admin1', 'owner1', 'rep1']);
    expect(sendPushToTokens.mock.calls[0][2]).toEqual({ title: 'Auto-fill', body: 'Try it', url: '/portal' });
  });

  it('never pushes pending, inactive or device-less users', async () => {
    const { db } = seed({ due: { title: 't', body: 'b', status: 'scheduled', sendAt: past } });
    await runDueAnnouncements({ db, now: NOW });
    const uids = sendPushToTokens.mock.calls.map((c) => c[0]);
    expect(uids).not.toContain('pending1');
    expect(uids).not.toContain('gone1');
    expect(uids).not.toContain('nodevice');
  });

  it('sends once when two runs overlap', async () => {
    const { db, store } = seed({ due: { title: 't', body: 'b', status: 'scheduled', sendAt: past } });

    const [first, second] = await Promise.all([
      runDueAnnouncements({ db, now: NOW }),
      runDueAnnouncements({ db, now: NOW }),
    ]);

    expect([...first.sent, ...second.sent]).toEqual(['due']);
    expect([...first.skipped, ...second.skipped]).toEqual(['due']);
    expect(sendPushToTokens).toHaveBeenCalledTimes(3);
    expect(store.get('announcements')!.get('due')?.status).toBe('sent');
  });

  it('does nothing on a later run once sent', async () => {
    const { db } = seed({ due: { title: 't', body: 'b', status: 'scheduled', sendAt: past } });
    await runDueAnnouncements({ db, now: NOW });
    sendPushToTokens.mockClear();
    const again = await runDueAnnouncements({ db, now: NOW });
    expect(again.due).toBe(0);
    expect(sendPushToTokens).not.toHaveBeenCalled();
  });

  it('counts users whose devices all failed', async () => {
    sendPushToTokens.mockImplementation(async (uid: string, tokens: string[]) =>
      uid === 'admin1' ? { delivered: 0, failed: tokens.length } : { delivered: tokens.length, failed: 0 }
    );
    const { db, store } = seed({ due: { title: 't', body: 'b', status: 'scheduled', sendAt: past } });
    await runDueAnnouncements({ db, now: NOW });
    expect(store.get('announcements')!.get('due')).toMatchObject({ status: 'sent', sentCount: 2, failedCount: 1 });
  });

  it("marks a send that throws as failed, never back to scheduled", async () => {
    sendPushToTokens.mockRejectedValue(new Error('FCM down'));
    const { db, store } = seed({ due: { title: 't', body: 'b', status: 'scheduled', sendAt: past } });
    const summary = await runDueAnnouncements({ db, now: NOW });
    expect(summary.failed).toEqual(['due']);
    expect(store.get('announcements')!.get('due')?.status).toBe('failed');
  });

  it('reads Firestore Timestamps for sendAt', async () => {
    const { db } = seed({
      due: { title: 't', body: 'b', status: 'scheduled', sendAt: { toDate: () => past } },
    });
    expect((await runDueAnnouncements({ db, now: NOW })).sent).toEqual(['due']);
  });
});

describe('sendAnnouncement (Send now)', () => {
  it('sends a due announcement once and records the counts', async () => {
    const { db, store } = seed({ now1: { title: 't', body: 'b', status: 'scheduled', sendAt: NOW } });
    expect(await sendAnnouncement(db, 'now1', NOW)).toEqual({ status: 'sent', sentCount: 3, failedCount: 0 });
    expect(store.get('announcements')!.get('now1')?.status).toBe('sent');
  });

  it('shares the claim with the cron: overlapping them sends once', async () => {
    const { db } = seed({ now1: { title: 't', body: 'b', status: 'scheduled', sendAt: NOW } });
    const [direct, cron] = await Promise.all([
      sendAnnouncement(db, 'now1', NOW),
      runDueAnnouncements({ db, now: NOW }),
    ]);
    expect([direct.status, cron.sent.length ? 'sent' : 'skipped'].sort()).toEqual(['sent', 'skipped']);
    expect(sendPushToTokens).toHaveBeenCalledTimes(3);
  });

  it('skips a cancelled or already-sent announcement', async () => {
    const { db } = seed({
      gone: { title: 't', body: 'b', status: 'cancelled', sendAt: past },
      done: { title: 't', body: 'b', status: 'sent', sendAt: past },
    });
    expect(await sendAnnouncement(db, 'gone', NOW)).toEqual({ status: 'skipped' });
    expect(await sendAnnouncement(db, 'done', NOW)).toEqual({ status: 'skipped' });
    expect(sendPushToTokens).not.toHaveBeenCalled();
  });
});

describe('sendTestToSelf', () => {
  it("pushes only to the caller's own devices", async () => {
    const { db } = seed({});
    const result = await sendTestToSelf(db, 'owner1', { title: 'T', body: 'B' });
    expect(result).toEqual({ devices: 1, delivered: 1 });
    expect(sendPushToTokens).toHaveBeenCalledTimes(1);
    expect(sendPushToTokens).toHaveBeenCalledWith('owner1', ['o1'], { title: 'T', body: 'B', url: '/portal' });
  });

  it('reports no devices without sending', async () => {
    const { db } = seed({});
    expect(await sendTestToSelf(db, 'nodevice', { title: 'T', body: 'B' })).toEqual({ devices: 0, delivered: 0 });
    expect(sendPushToTokens).not.toHaveBeenCalled();
  });
});
