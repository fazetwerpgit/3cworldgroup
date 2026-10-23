import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeAskDb } from '@/lib/ask/fakeAskDb';

// The owner's Ask 3C notes: POST and PATCH take an optional audience; a new
// note without one is for everyone, an edit without one keeps its tags, and
// anything but known tags is refused. Everything stays in the fake Firestore.

const state = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return state.db;
  },
}));
vi.mock('@/lib/announcements/requireOwner', () => ({ requireOwner: vi.fn() }));

import { GET, POST } from './route';
import { PATCH } from './[id]/route';
import { requireOwner } from '@/lib/announcements/requireOwner';

const mockOwner = requireOwner as unknown as ReturnType<typeof vi.fn>;
let fake: ReturnType<typeof createFakeAskDb>;

const req = (url: string, method: string, body?: unknown) =>
  new NextRequest(`http://localhost${url}`, {
    method,
    headers: { authorization: 'Bearer t', 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  mockOwner.mockReset();
  mockOwner.mockResolvedValue({ ok: true, uid: 'o1', name: 'Jacob Owner' });
  fake = createFakeAskDb({
    knowledgeNotes: {
      old: { title: 'Old note', body: 'From before tags.', order: 1 },
      sol: { title: 'Solar note', body: 'Solar only.', order: 2, audience: ['solar'] },
    },
  });
  // The fake has no batch or auto-id doc(): add both.
  const db = fake.db as unknown as Record<string, unknown>;
  const collection = fake.db.collection;
  let autoId = 0;
  db.collection = (name: string) => {
    const col = collection(name);
    return { ...col, doc: (id?: string) => col.doc(id ?? `new${++autoId}`) };
  };
  db.batch = () => {
    const writes: Array<() => Promise<unknown>> = [];
    return {
      set: (ref: { set: (data: unknown) => Promise<unknown> }, data: unknown) => writes.push(() => ref.set(data)),
      commit: async () => {
        for (const write of writes) await write();
      },
    };
  };
  state.db = fake.db;
});

const stored = (id: string) => fake.docs('knowledgeNotes').get(id) as Record<string, unknown>;

describe('knowledge notes audience', () => {
  it('GET reads an untagged note as everyone', async () => {
    const { notes } = await (await GET(req('/api/portal/knowledge', 'GET'))).json();
    expect(notes.map((n: { id: string; audience: string[] }) => [n.id, n.audience])).toEqual([
      ['old', ['all']],
      ['sol', ['solar']],
    ]);
  });

  it('POST stores the sent audience, or everyone when none is sent', async () => {
    const res = await POST(
      req('/api/portal/knowledge', 'POST', {
        notes: [
          { title: 'Managers', body: 'For managers.', audience: ['owner', 'manager'] },
          { title: 'Plain', body: 'For all.' },
        ],
      })
    );
    expect(res.status).toBe(201);
    const { ids } = await res.json();
    expect(stored(ids[0]).audience).toEqual(['manager', 'owner']);
    expect(stored(ids[1]).audience).toEqual(['all']);
  });

  it('POST refuses an unknown or empty audience, and writes nothing', async () => {
    for (const audience of [['vip'], [], 'solar']) {
      const res = await POST(req('/api/portal/knowledge', 'POST', { notes: [{ title: 'T', body: 'B', audience }] }));
      expect(res.status).toBe(400);
    }
    expect(fake.docs('knowledgeNotes').size).toBe(2);
  });

  it('PATCH changes the audience when sent and keeps it when not', async () => {
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    expect((await PATCH(req('/api/portal/knowledge/sol', 'PATCH', { title: 'Solar note', body: 'Edited.' }), params('sol')))?.status).toBe(200);
    expect(stored('sol').audience).toEqual(['solar']);
    expect(stored('sol').body).toBe('Edited.');

    expect(
      (await PATCH(req('/api/portal/knowledge/sol', 'PATCH', { title: 'Solar note', body: 'Edited.', audience: ['all', 'solar'] }), params('sol')))?.status
    ).toBe(200);
    expect(stored('sol').audience).toEqual(['all']);

    expect((await PATCH(req('/api/portal/knowledge/old', 'PATCH', { title: 'Old', body: 'B', audience: ['nobody'] }), params('old')))?.status).toBe(400);
    expect(stored('old').audience).toBeUndefined();
  });
});
