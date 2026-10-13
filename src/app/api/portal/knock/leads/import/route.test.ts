import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeLeadDb, type FakeLeadDb } from '@/lib/knock/fakeLeadDb';
import { ATT_CSV, bigAttCsv, leadSeed } from '@/lib/knock/leadTestCsv';
import type { LeadImportEvent } from '@/lib/knock/leadImportServer';

vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({
  requireVerifiedManagement: vi.fn(),
}));

const holder = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('@/lib/firebase/admin', () => ({
  get adminDb() {
    return holder.db;
  },
}));

import { POST } from './route';
import { POST as PREVIEW } from '../preview/route';
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const mockGate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown, path = 'import') {
  return new NextRequest(`http://localhost/api/portal/knock/leads/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function events(res: Response): Promise<LeadImportEvent[]> {
  expect(res.headers.get('content-type')).toContain('application/x-ndjson');
  return (await res.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as LeadImportEvent);
}

const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };
const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false };
let fake: FakeLeadDb;

beforeEach(() => {
  mockGate.mockReset();
  fake = createFakeLeadDb(leadSeed());
  holder.db = fake.db;
  process.env.KNOCK_LEAD_IMPORT_LIVE = '1';
});

describe('POST /api/portal/knock/leads/import', () => {
  it('refuses every non-owner and writes nothing', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }))).status).toBe(401);
    mockGate.mockResolvedValue(ADMIN);
    const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }));
    expect(res.status).toBe(403);
    expect(fake.commits).toEqual([]);
  });

  it('kill-switch: refuses unless KNOCK_LEAD_IMPORT_LIVE=1, while preview still runs', async () => {
    mockGate.mockResolvedValue(OWNER);
    for (const value of [undefined, '0', 'true']) {
      if (value === undefined) delete process.env.KNOCK_LEAD_IMPORT_LIVE;
      else process.env.KNOCK_LEAD_IMPORT_LIVE = value;
      const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }));
      expect(res.status).toBe(403);
      expect((await res.json()).code).toBe('not-enabled');
    }
    expect(fake.commits).toEqual([]);
    const preview = await PREVIEW(req({ csvText: ATT_CSV, campaignId: 'camp-1' }, 'preview'));
    expect(preview.status).toBe(200);
    expect((await preview.json()).doors).toBe(4);
  });

  it('writes the server plan as house docs, with the rep and their manager', async () => {
    mockGate.mockResolvedValue(OWNER);
    const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1', assignTo: 'rep-1' }));
    expect(res.status).toBe(200);
    const lines = await events(res);
    expect(lines.at(-1)).toMatchObject({ type: 'done', written: 4, alreadyThere: 0, summary: { doors: 4, duplicates: 1 } });
    expect(fake.commits).toEqual([['camp-1__att-l1', 'camp-1__att-l2', 'camp-1__att-l9', 'camp-1__att-mdu-l3']]);

    const houses = fake.docs('houses');
    expect(houses.get('camp-1__att-l1')).toEqual({
      campaignId: 'camp-1',
      packId: 'att-1111pa',
      packName: '1111PA',
      address: '100 Oak St',
      city: 'Testville',
      lat: 35.1,
      lng: -97.1,
      assignedRepId: 'rep-1',
      managerId: 'mgr-1',
      last: null,
      notHomeCount: 0,
      unitOrder: null,
      units: null,
      movedBy: null,
      createdBy: null,
      updatedAt: expect.any(Number),
    });
    expect(houses.get('camp-1__att-mdu-l3')).toMatchObject({ unitOrder: ['1', '2'], units: {}, packId: 'att-2222pb' });
    // The same door in another campaign is a separate doc there, untouched.
    expect(houses.get('camp-2__att-l9')).toMatchObject({ campaignId: 'camp-2', packId: 'att-9999pz' });
    expect(houses.get('camp-1__att-l9')).toMatchObject({ campaignId: 'camp-1', packId: 'att-1111pa' });
  });

  it('is idempotent: the same file again adds nothing', async () => {
    mockGate.mockResolvedValue(OWNER);
    await events(await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' })));
    const before = structuredClone(Object.fromEntries(fake.docs('houses')));
    const again = await events(await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' })));
    expect(again.at(-1)).toMatchObject({ type: 'done', written: 0, alreadyThere: 0, summary: { doors: 0, duplicates: 5 } });
    expect(fake.commits).toHaveLength(1);
    expect(Object.fromEntries(fake.docs('houses'))).toEqual(before);
  });

  it('leaves alone a door that appeared after planning and writes the rest', async () => {
    mockGate.mockResolvedValue(OWNER);
    const theirs = { campaignId: 'camp-1', packId: 'att-1111pa', address: 'someone else wrote this' };
    fake.beforeNextCommit = () => fake.docs('houses').set('camp-1__att-l2', theirs);
    const lines = await events(await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' })));
    expect(lines.at(-1)).toMatchObject({ type: 'done', written: 3, alreadyThere: 1 });
    expect(fake.docs('houses').get('camp-1__att-l2')).toEqual(theirs);
    expect(fake.commits).toEqual([['camp-1__att-l1', 'camp-1__att-l9', 'camp-1__att-mdu-l3']]);
  });

  it('writes at most 450 houses per batch and reports progress after each', async () => {
    mockGate.mockResolvedValue(OWNER);
    const lines = await events(await POST(req({ csvText: bigAttCsv(1000), campaignId: 'camp-1' })));
    expect(fake.commits.map((ids) => ids.length)).toEqual([450, 450, 100]);
    expect(lines.filter((line) => line.type === 'progress')).toEqual([
      { type: 'progress', handled: 0, total: 1000 },
      { type: 'progress', handled: 450, total: 1000 },
      { type: 'progress', handled: 900, total: 1000 },
      { type: 'progress', handled: 1000, total: 1000 },
    ]);
    expect(lines.at(-1)).toMatchObject({ type: 'done', written: 1000 });
  });

  it('ends with an error line when a write fails partway', async () => {
    mockGate.mockResolvedValue(OWNER);
    fake.failCommit = 2;
    const lines = await events(await POST(req({ csvText: bigAttCsv(1000), campaignId: 'camp-1' })));
    expect(lines.at(-1)).toEqual({
      type: 'error',
      error: 'Saving the doors stopped partway. Upload the same file again to add the rest.',
      handled: 450,
    });
    expect(fake.docs('houses').size).toBe(2 + 450);
  });
});
