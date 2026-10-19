import { describe, expect, it, vi } from 'vitest';
import { compactSummary, cronRunId, recordCronRun, withCronRun } from './runLog';

function fakeDb() {
  const docs = new Map<string, Record<string, unknown>>();
  const db = {
    collection: (name: string) => ({
      doc: (id: string) => ({
        set: async (data: Record<string, unknown>) => void docs.set(`${name}/${id}`, data),
      }),
    }),
  } as unknown as FirebaseFirestore.Firestore;
  return { db, docs };
}

describe('cron run log', () => {
  it('keys a run by job, UTC day and slot', () => {
    const at = new Date('2026-09-21T13:00:05Z');
    expect(cronRunId('weekly-installs', 'cdt', at)).toBe('weekly-installs_2026-09-21_cdt');
    expect(cronRunId('chat-evidence', null, at)).toBe('chat-evidence_2026-09-21');
    expect(cronRunId('x', '../evil', at)).toBe('x_2026-09-21_-evil');
  });

  it('compacts summaries: scalars kept, lists become counts', () => {
    expect(
      compactSummary({ sent: 2, ok: true, pushes: [{ uid: 'a', name: 'Rep' }], week: { from: '2026-09-13' }, deep: { a: { b: { c: 1 } } } })
    ).toEqual({ sent: 2, ok: true, pushes: 1, week: { from: '2026-09-13' }, deep: { a: null } });
  });

  it('withCronRun records success and returns the summary untouched', async () => {
    const { db, docs } = fakeDb();
    const summary = { sent: 1, failed: 1, names: ['A', 'B'] };
    const out = await withCronRun(db, 'install-reminders', new Request('http://x/api?slot=cst'), async () => summary, (s) => s.failed === 0);
    expect(out).toBe(summary);
    const [id, doc] = [...docs.entries()][0];
    expect(id).toMatch(/^cronRuns\/install-reminders_\d{4}-\d{2}-\d{2}_cst$/);
    expect(doc).toMatchObject({ job: 'install-reminders', slot: 'cst', ok: false, summary: { sent: 1, failed: 1, names: 2 } });
    expect(typeof doc.durationMs).toBe('number');
  });

  it('withCronRun records a throw and rethrows it', async () => {
    const { db, docs } = fakeDb();
    await expect(
      withCronRun(db, 'search-stats', new Request('http://x/api'), async () => {
        throw new Error('boom');
      })
    ).rejects.toThrow('boom');
    expect([...docs.values()][0]).toMatchObject({ ok: false, error: 'boom', slot: null });
  });

  it('never throws when the log write fails', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = { collection: () => { throw new Error('no db'); } } as unknown as FirebaseFirestore.Firestore;
    await expect(recordCronRun(db, { job: 'x', startedAt: new Date(), ok: true })).resolves.toBeUndefined();
    error.mockRestore();
  });
});
