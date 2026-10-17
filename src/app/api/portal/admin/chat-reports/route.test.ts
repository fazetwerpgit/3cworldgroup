import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => {
  const reports = new Map<string, Record<string, unknown>>();
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const gate = { result: { ok: true, uid: 'admin-1', name: 'Ada Admin' } as Record<string, unknown> };
  const ref = (id: string) => ({ id });
  const docOf = (id: string) => ({ id, ref: ref(id), data: () => reports.get(id) ?? {} });
  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'chatReports') throw new Error(`Unexpected collection: ${name}`);
      return {
        where: (field: string, _op: string, value: unknown) => ({
          get: async () => ({
            docs: [...reports.entries()].filter(([, data]) => data[field] === value).map(([id]) => docOf(id)),
          }),
        }),
        doc: (id: string) => ({
          get: async () => ({ exists: reports.has(id), ref: ref(id), data: () => reports.get(id) }),
        }),
      };
    }),
    batch: () => {
      const pending: Array<{ id: string; data: Record<string, unknown> }> = [];
      return {
        update: (target: { id: string }, data: Record<string, unknown>) => pending.push({ id: target.id, data }),
        commit: async () => {
          updates.push(...pending);
        },
      };
    },
  };
  return { reports, updates, gate, adminDb };
});

vi.mock('@/lib/firebase/admin', () => ({ adminDb: fake.adminDb }));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(async () => fake.gate.result),
}));

import { GET, PATCH } from './route';

function req(method: 'GET' | 'PATCH', options: { body?: unknown; query?: string } = {}) {
  return new NextRequest(`http://localhost/api/portal/admin/chat-reports${options.query ?? ''}`, {
    method,
    headers: { Authorization: 'Bearer t', 'Content-Type': 'application/json' },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

const at = (iso: string) => ({ toDate: () => new Date(iso) });

beforeEach(() => {
  fake.reports.clear();
  fake.updates.length = 0;
  fake.gate.result = { ok: true, uid: 'admin-1', name: 'Ada Admin' };
  fake.reports.set('m1_rep-a', {
    messageId: 'm1',
    channelId: 'all-company',
    reporterUid: 'rep-a',
    reason: 'harassment',
    messageText: 'bad words',
    authorId: 'rep-x',
    status: 'open',
    createdAt: at('2026-10-15T10:00:00Z'),
  });
  fake.reports.set('m1_rep-b', {
    messageId: 'm1',
    channelId: 'all-company',
    reporterUid: 'rep-b',
    reason: 'spam',
    messageText: 'bad words',
    authorId: 'rep-x',
    status: 'open',
    createdAt: at('2026-10-16T10:00:00Z'),
  });
  fake.reports.set('m2_rep-a', {
    messageId: 'm2',
    channelId: 'new-reps',
    reporterUid: 'rep-a',
    reason: 'other',
    messageText: 'old one',
    authorId: 'rep-y',
    status: 'dismissed',
    createdAt: at('2026-10-01T10:00:00Z'),
    resolvedAt: at('2026-10-02T10:00:00Z'),
    resolvedBy: 'admin-2',
  });
});

describe('GET /api/portal/admin/chat-reports', () => {
  it('refuses a caller who is not management', async () => {
    fake.gate.result = { ok: false, error: 'Forbidden: management access required', status: 403 };
    const res = await GET(req('GET'));
    expect(res.status).toBe(403);
  });

  it('lists open reports newest first with ISO times', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports.map((r: { id: string }) => r.id)).toEqual(['m1_rep-b', 'm1_rep-a']);
    expect(json.reports[0].createdAt).toBe('2026-10-16T10:00:00.000Z');
  });

  it('lists resolved reports on ?status=resolved', async () => {
    const res = await GET(req('GET', { query: '?status=resolved' }));
    const json = await res.json();
    expect(json.reports.map((r: { id: string }) => r.id)).toEqual(['m2_rep-a']);
    expect(json.reports[0].status).toBe('dismissed');
  });

  it('shows the saved evidence copy in place of the deleted chat upload', async () => {
    fake.reports.set('m2_rep-a', {
      ...fake.reports.get('m2_rep-a'),
      attachmentUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/chat%2Fnew-reps%2Fx.png?alt=media&token=old',
      attachmentType: 'image',
      evidencePath: 'moderation/chat-reports/new-reps/m2/x.png',
      evidenceUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/moderation%2Fx.png?alt=media&token=new',
    });
    const json = await (await GET(req('GET', { query: '?status=resolved' }))).json();
    expect(json.reports[0].attachmentUrl).toContain('token=new');
    expect(json.reports[0].evidencePath).toBe('moderation/chat-reports/new-reps/m2/x.png');
  });

  it('rejects an unknown status filter', async () => {
    const res = await GET(req('GET', { query: '?status=everything' }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/portal/admin/chat-reports', () => {
  it('refuses a caller who is not management', async () => {
    fake.gate.result = { ok: false, error: 'Forbidden: management access required', status: 403 };
    const res = await PATCH(req('PATCH', { body: { id: 'm1_rep-a', action: 'dismissed' } }));
    expect(res.status).toBe(403);
    expect(fake.updates).toHaveLength(0);
  });

  it('rejects a bad action or id', async () => {
    expect((await PATCH(req('PATCH', { body: { id: 'm1_rep-a', action: 'delete' } }))).status).toBe(400);
    expect((await PATCH(req('PATCH', { body: { id: '../x', action: 'removed' } }))).status).toBe(400);
    expect((await PATCH(req('PATCH', { body: { action: 'removed' } }))).status).toBe(400);
    expect(fake.updates).toHaveLength(0);
  });

  it('answers 404 for a missing report', async () => {
    const res = await PATCH(req('PATCH', { body: { id: 'nope_rep-a', action: 'dismissed' } }));
    expect(res.status).toBe(404);
  });

  it('resolves the report and every other open report on the same message', async () => {
    const res = await PATCH(req('PATCH', { body: { id: 'm1_rep-a', action: 'removed' } }));
    expect(res.status).toBe(200);
    const ids = fake.updates.map((u) => u.id).sort();
    expect(ids).toEqual(['m1_rep-a', 'm1_rep-b']);
    for (const update of fake.updates) {
      expect(update.data).toMatchObject({ status: 'removed', resolvedBy: 'admin-1', resolvedByName: 'Ada Admin' });
      expect(update.data.resolvedAt).toBeDefined();
    }
  });

  it('leaves already-resolved siblings alone', async () => {
    fake.reports.set('m2_rep-b', { messageId: 'm2', status: 'open', createdAt: at('2026-10-03T10:00:00Z') });
    await PATCH(req('PATCH', { body: { id: 'm2_rep-b', action: 'dismissed' } }));
    expect(fake.updates.map((u) => u.id)).toEqual(['m2_rep-b']);
  });
});
