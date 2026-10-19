import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const fake = vi.hoisted(() => {
  const reports = new Map<string, Record<string, unknown>>();
  const updates: Array<{ id: string; data: Record<string, unknown> }> = [];
  const gate = { result: { ok: true, uid: 'admin-1', name: 'Ada Admin' } as Record<string, unknown> };
  const ref = (id: string) => ({ id });
  const docOf = (id: string) => ({ id, ref: ref(id), data: () => reports.get(id) ?? {} });
  // A small query fake: where (== / in / >=), orderBy, startAfter(snapshot),
  // limit, count(). orderBy compares the fields' ISO times.
  type Filter = { field: string; op: string; value: unknown };
  const timeOf = (value: unknown) =>
    value && typeof value === 'object' && 'toDate' in value
      ? (value as { toDate: () => Date }).toDate().getTime()
      : value && typeof value === 'object' && 'toMillis' in value
        ? (value as { toMillis: () => number }).toMillis()
        : Number.NaN;
  const queries: Array<{ filters: Filter[]; order: { field: string; dir: string } | null; limit: number | null }> = [];
  const query = (
    filters: Filter[],
    order: { field: string; dir: string } | null,
    startAfterId: string | null,
    max: number | null
  ) => {
    const run = () => {
      let rows = [...reports.entries()].filter(([, data]) =>
        filters.every(({ field, op, value }) =>
          op === '==' ? data[field] === value
          : op === 'in' ? (value as unknown[]).includes(data[field])
          : op === '>=' ? timeOf(data[field]) >= timeOf(value)
          : false
        )
      );
      if (order) {
        const sign = order.dir === 'desc' ? -1 : 1;
        rows.sort(([ia, a], [ib, b]) => sign * (timeOf(a[order.field]) - timeOf(b[order.field]) || ia.localeCompare(ib)));
      }
      if (startAfterId) {
        const at = rows.findIndex(([id]) => id === startAfterId);
        rows = rows.slice(at + 1);
      }
      if (max !== null) rows = rows.slice(0, max);
      return rows.map(([id]) => docOf(id));
    };
    return {
      where: (field: string, op: string, value: unknown) => query([...filters, { field, op, value }], order, startAfterId, max),
      orderBy: (field: string, dir = 'asc') => query(filters, { field, dir }, startAfterId, max),
      startAfter: (snap: { id: string }) => query(filters, order, snap.id, max),
      limit: (n: number) => query(filters, order, startAfterId, n),
      count: () => ({ get: async () => ({ data: () => ({ count: run().length }) }) }),
      get: async () => {
        queries.push({ filters, order, limit: max });
        return { docs: run() };
      },
    };
  };
  const adminDb = {
    collection: vi.fn((name: string) => {
      if (name !== 'chatReports') throw new Error(`Unexpected collection: ${name}`);
      return {
        ...query([], null, null, null),
        doc: (id: string) => ({
          get: async () => ({ id, exists: reports.has(id), ref: ref(id), data: () => reports.get(id) }),
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
  return { reports, updates, gate, adminDb, queries };
});

// Signed read links: getOnboardingBucket().file(path).getSignedUrl(options).
const signMock = vi.hoisted(() =>
  vi.fn<(path: string, options: { version?: string; action: string; expires: number }) => Promise<string[]>>(
    async (path) => [`https://signed.example/${path}?X-Goog-Expires=600`]
  )
);
vi.mock('@/lib/firebase/admin', () => ({
  adminDb: fake.adminDb,
  getOnboardingBucket: () => ({
    file: (path: string) => ({
      getSignedUrl: (options: { version?: string; action: string; expires: number }) => signMock(path, options),
    }),
  }),
}));
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

const BUCKET = 'demo-bucket';

beforeEach(() => {
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET = BUCKET;
  signMock.mockClear();
  fake.reports.clear();
  fake.updates.length = 0;
  fake.queries.length = 0;
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

  it('lists open reports oldest first with ISO times, through an indexed limited query', async () => {
    const res = await GET(req('GET'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.reports.map((r: { id: string }) => r.id)).toEqual(['m1_rep-a', 'm1_rep-b']);
    expect(json.reports[0].createdAt).toBe('2026-10-15T10:00:00.000Z');
    expect(json.nextCursor).toBeNull();
    expect(fake.queries[0]).toEqual({
      filters: [{ field: 'status', op: '==', value: 'open' }],
      order: { field: 'createdAt', dir: 'asc' },
      limit: 51,
    });
  });

  it('lists resolved reports most recently handled first on ?status=resolved', async () => {
    fake.reports.set('m3_rep-c', {
      messageId: 'm3',
      status: 'removed',
      createdAt: at('2026-09-01T10:00:00Z'),
      resolvedAt: at('2026-10-05T10:00:00Z'),
    });
    const res = await GET(req('GET', { query: '?status=resolved' }));
    const json = await res.json();
    expect(json.reports.map((r: { id: string }) => r.id)).toEqual(['m3_rep-c', 'm2_rep-a']);
    expect(json.reports[1].status).toBe('dismissed');
    expect(fake.queries[0]).toEqual({
      filters: [{ field: 'status', op: 'in', value: ['removed', 'dismissed'] }],
      order: { field: 'resolvedAt', dir: 'desc' },
      limit: 51,
    });
  });

  it('pages with nextCursor until the end', async () => {
    for (let i = 0; i < 60; i += 1) {
      const day = String(1 + Math.floor(i / 24)).padStart(2, '0');
      const hour = String(i % 24).padStart(2, '0');
      fake.reports.set(`r${String(i).padStart(2, '0')}_rep-z`, {
        messageId: `r${i}`,
        status: 'dismissed',
        resolvedAt: at(`2026-09-${day}T${hour}:00:00Z`),
      });
    }
    const first = await (await GET(req('GET', { query: '?status=resolved' }))).json();
    expect(first.reports).toHaveLength(50);
    expect(first.reports[0].id).toBe('m2_rep-a');
    expect(typeof first.nextCursor).toBe('string');
    expect(first.nextCursor).toBe(first.reports[49].id);

    const second = await (
      await GET(req('GET', { query: `?status=resolved&cursor=${encodeURIComponent(first.nextCursor)}` }))
    ).json();
    expect(second.reports).toHaveLength(11);
    expect(second.nextCursor).toBeNull();
    const all = [...first.reports, ...second.reports].map((r: { id: string }) => r.id);
    expect(new Set(all).size).toBe(61);
  });

  it('rejects a malformed or unknown cursor', async () => {
    expect((await GET(req('GET', { query: '?cursor=../x' }))).status).toBe(400);
    expect((await GET(req('GET', { query: '?cursor=gone_rep-a' }))).status).toBe(400);
  });

  it('signs a short-lived link to the saved evidence copy in place of the deleted chat upload', async () => {
    fake.reports.set('m2_rep-a', {
      ...fake.reports.get('m2_rep-a'),
      attachmentUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/chat%2Fnew-reps%2Fx.png?alt=media&token=old`,
      attachmentType: 'image',
      evidencePath: 'moderation/chat-reports/new-reps/m2/x.png',
    });
    const before = Date.now();
    const json = await (await GET(req('GET', { query: '?status=resolved' }))).json();
    const row = json.reports[0];
    expect(row.attachmentUrl).toBe('https://signed.example/moderation/chat-reports/new-reps/m2/x.png?X-Goog-Expires=600');
    expect(row.attachmentUrl).not.toContain('token=');
    expect(row.evidencePath).toBe('moderation/chat-reports/new-reps/m2/x.png');
    const [path, options] = signMock.mock.calls[0];
    expect(path).toBe('moderation/chat-reports/new-reps/m2/x.png');
    expect(options).toMatchObject({ version: 'v4', action: 'read' });
    expect(options.expires - before).toBeGreaterThanOrEqual(10 * 60 * 1000 - 50);
    expect(options.expires - before).toBeLessThanOrEqual(10 * 60 * 1000 + 1000);
    expect(new Date(row.attachmentExpiresAt).getTime()).toBe(options.expires);
  });

  it('keeps showing the stored evidenceUrl of an older report that has no evidencePath', async () => {
    fake.reports.set('m2_rep-a', {
      ...fake.reports.get('m2_rep-a'),
      attachmentType: 'image',
      evidenceUrl: 'https://firebasestorage.googleapis.com/v0/b/b/o/moderation%2Fx.png?alt=media&token=legacy',
    });
    const json = await (await GET(req('GET', { query: '?status=resolved' }))).json();
    expect(json.reports[0].attachmentUrl).toContain('token=legacy');
    expect(json.reports[0].attachmentExpiresAt).toBeNull();
    expect(signMock).not.toHaveBeenCalled();
  });

  it('signs the chat upload of an open report instead of handing out its tokened URL', async () => {
    fake.reports.set('m1_rep-a', {
      ...fake.reports.get('m1_rep-a'),
      attachmentUrl: `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/chat%2Fall-company%2Fp.png?alt=media&token=t`,
      attachmentType: 'image',
    });
    const json = await (await GET(req('GET'))).json();
    const row = json.reports.find((r: { id: string }) => r.id === 'm1_rep-a');
    expect(row.attachmentUrl).toBe('https://signed.example/chat/all-company/p.png?X-Goog-Expires=600');
  });

  it('falls back to the stored link when signing fails, and leaves a GIF link as it is', async () => {
    signMock.mockRejectedValueOnce(Object.assign(new Error('no signer'), { code: 403 }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      fake.reports.set('m2_rep-a', {
        ...fake.reports.get('m2_rep-a'),
        attachmentType: 'image',
        evidencePath: 'moderation/chat-reports/new-reps/m2/x.png',
        attachmentUrl: 'https://media.giphy.com/x.gif',
      });
      const json = await (await GET(req('GET', { query: '?status=resolved' }))).json();
      expect(json.reports[0].attachmentUrl).toBe('https://media.giphy.com/x.gif');
      expect(json.reports[0].attachmentExpiresAt).toBeNull();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('re-signs one report on ?id= for a link that ran out', async () => {
    fake.reports.set('m2_rep-a', {
      ...fake.reports.get('m2_rep-a'),
      attachmentType: 'image',
      evidencePath: 'moderation/chat-reports/new-reps/m2/x.png',
    });
    const res = await GET(req('GET', { query: '?id=m2_rep-a' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.report).toMatchObject({
      id: 'm2_rep-a',
      attachmentUrl: 'https://signed.example/moderation/chat-reports/new-reps/m2/x.png?X-Goog-Expires=600',
    });
    expect(typeof json.report.attachmentExpiresAt).toBe('string');
  });

  it('answers 404 for an unknown ?id= and 400 for a malformed one', async () => {
    expect((await GET(req('GET', { query: '?id=nope_none' }))).status).toBe(404);
    expect((await GET(req('GET', { query: '?id=../x' }))).status).toBe(400);
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
