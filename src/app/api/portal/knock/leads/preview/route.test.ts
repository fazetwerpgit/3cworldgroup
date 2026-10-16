import { gzipSync } from 'node:zlib';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { createFakeLeadDb, type FakeLeadDb } from '@/lib/knock/fakeLeadDb';
import { ATT_CSV, SR_CSV, SR_PLUS_CSV, SR_PLUS_POINTS, bigAttCsv, fakeCensusFetch, leadSeed } from '@/lib/knock/leadTestCsv';

// Mock the verified-auth gate so we control who the caller is (requireOwner runs for real on top).
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
import { requireVerifiedManagement } from '@/lib/auth/requireVerifiedAdmin';

const mockGate = requireVerifiedManagement as unknown as ReturnType<typeof vi.fn>;

function req(body: unknown) {
  return new NextRequest('http://localhost/api/portal/knock/leads/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

const OWNER = { ok: true, uid: 'owner-1', name: 'Owner', isAdmin: true, isOwner: true };
const ADMIN = { ok: true, uid: 'admin-1', name: 'Admin', isAdmin: true, isOwner: false };
let fake: FakeLeadDb;
// The Census geocoder is reached through the global fetch; tests swap in fakeCensusFetch, and
// anything else fails, so no test ever touches the network.
const fetchMock = vi.fn<typeof fetch>(async () => {
  throw new Error('no network in tests');
});

beforeEach(() => {
  mockGate.mockReset();
  fake = createFakeLeadDb(leadSeed());
  holder.db = fake.db;
  delete process.env.KNOCK_LEAD_IMPORT_LIVE;
  fetchMock.mockReset();
  fetchMock.mockImplementation(fakeCensusFetch(SR_PLUS_POINTS));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('POST /api/portal/knock/leads/preview', () => {
  it('rejects an unauthenticated caller and every non-owner', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }))).status).toBe(401);

    mockGate.mockResolvedValue({ ok: false, error: 'Forbidden: management access required', status: 403 });
    expect((await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }))).status).toBe(403);

    mockGate.mockResolvedValue(ADMIN);
    const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: 'Forbidden: owner access required' });
  });

  it('counts an AT&T list against the campaign on the server and writes nothing', async () => {
    mockGate.mockResolvedValue(OWNER);
    const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      format: 'att',
      campaign: { id: 'camp-1', name: 'Test Fiber' },
      assignee: null,
      rows: 11,
      // 11 rows = 4 houses + 2 apartments + 1 + 1 + 1 left out + 2 listed twice.
      rowsBreakdown: { houseRows: 4, apartmentRows: 2, buildings: 1 },
      doors: 4,
      packs: [
        { packId: 'att-1111pa', name: '1111PA', count: 3, isNew: false },
        { packId: 'att-2222pb', name: '2222PB', count: 1, isNew: true },
      ],
      skipped: [
        { reason: 'not-door-knock-allowed', count: 1 },
        { reason: 'no-coordinates', count: 1 },
        { reason: 'no-pack', count: 1 },
        { reason: 'repeated-row', count: 2 },
      ],
      duplicates: 1,
      mdus: 1,
      units: 2,
      fromFile: false,
      addressPending: 0,
      geocoded: 0,
      approximate: 0,
      notLocated: 0,
      statuses: [],
      unmatchedStatuses: [],
      assignees: [],
      unmatchedAssignees: [],
      fileAssignees: 0,
      appointments: { kept: 0, ignored: 0 },
      contacts: 0,
      notes: 0,
      live: false,
    });
    expect(fake.commits).toEqual([]);
    expect([...fake.docs('houses').keys()].sort()).toEqual(['camp-1__att-l8', 'camp-2__att-l9']);
    // AT&T files carry coordinates: nothing to look up.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('locates address-only rows with the Census geocoder, matches statuses and gives doors out as the file says', async () => {
    mockGate.mockResolvedValue(OWNER);
    const res = await POST(req({ csvText: SR_PLUS_CSV, campaignId: 'camp-1', assignTo: 'file' }));
    expect(res.status).toBe(200);
    // One request to the Census batch endpoint, for the three addresses that can be looked up.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe('https://geocoding.geo.census.gov/geocoder/locations/addressbatch');
    expect(await res.json()).toMatchObject({
      format: 'sr',
      assignee: null,
      fromFile: true,
      rows: 7,
      rowsBreakdown: { houseRows: 5, apartmentRows: 0, buildings: 0 },
      doors: 5,
      skipped: [{ reason: 'not-located', count: 2 }],
      geocoded: 2,
      approximate: 1,
      notLocated: 2,
      addressPending: 3,
      statuses: [
        { name: 'Go Back', dispositionId: 'go_back', count: 1 },
        { name: 'Not Home 3', dispositionId: 'not_home', count: 1 },
        { name: 'Sold', dispositionId: 'sold', count: 1 },
      ],
      unmatchedStatuses: [{ name: 'Knock', count: 1 }],
      assignees: [{ email: 'rep1@example.test', uid: 'rep-1', name: 'Rep One', count: 3 }],
      unmatchedAssignees: [{ email: 'stranger@example.test', count: 1 }],
      fileAssignees: 2,
      appointments: { kept: 1, ignored: 1 },
      contacts: 2,
      notes: 1,
    });
    expect(fake.commits).toEqual([]);
  });

  it('says so when the geocoder does not answer, and checks nothing else', async () => {
    mockGate.mockResolvedValue(OWNER);
    fetchMock.mockImplementation(async () => new Response('Service Unavailable', { status: 503 }));
    const res = await POST(req({ csvText: SR_PLUS_CSV, campaignId: 'camp-1' }));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({
      code: 'geocoder-unavailable',
      error: "Couldn't look up the addresses on the map: the US Census address service didn't answer. Try again in a few minutes.",
    });
    // Tried once more before giving up (geocode.ts).
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('says whether Import is switched on', async () => {
    mockGate.mockResolvedValue(OWNER);
    process.env.KNOCK_LEAD_IMPORT_LIVE = '1';
    expect((await (await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1' }))).json()).live).toBe(true);
  });

  it('reads a SalesRabbit export and a gzipped body', async () => {
    mockGate.mockResolvedValue(OWNER);
    const res = await POST(
      new NextRequest('http://localhost/api/portal/knock/leads/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/gzip' },
        body: gzipSync(JSON.stringify({ csvText: SR_CSV, campaignId: 'camp-1' })),
      })
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      format: 'sr',
      rows: 2,
      rowsBreakdown: { houseRows: 2, apartmentRows: 0, buildings: 0 },
      doors: 2,
      duplicates: 0,
      skipped: [],
    });
    expect(body.packs).toEqual([{ packId: 'att-sr-1', name: 'SR OKC 1', count: 2, isNew: true }]);
  });

  it('names the rep the doors go to, and refuses an unknown or inactive one', async () => {
    mockGate.mockResolvedValue(OWNER);
    const res = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1', assignTo: 'rep-1' }));
    expect((await res.json()).assignee).toEqual({ uid: 'rep-1', name: 'Rep One' });

    for (const assignTo of ['nobody', 'rep-gone']) {
      const bad = await POST(req({ csvText: ATT_CSV, campaignId: 'camp-1', assignTo }));
      expect(bad.status).toBe(400);
      expect(await bad.json()).toEqual({ error: 'Pick the rep again.', code: 'unknown-rep' });
    }
  });

  it('explains files and campaigns it cannot use', async () => {
    mockGate.mockResolvedValue(OWNER);
    const cases: [unknown, number, string][] = [
      [{ csvText: 'Name,Phone\nA,1', campaignId: 'camp-1' }, 400, 'unknown-format'],
      [{ csvText: 'Latitude,Longitude,Door Knock Allowed,PSA\n', campaignId: 'camp-1' }, 400, 'empty'],
      [{ csvText: '', campaignId: 'camp-1' }, 400, 'empty'],
      [{ csvText: ATT_CSV, campaignId: 'no-such-campaign' }, 404, 'unknown-campaign'],
      [{ csvText: ATT_CSV }, 400, 'unknown-campaign'],
      [{ csvText: bigAttCsv(20_001), campaignId: 'camp-1' }, 413, 'too-many-rows'],
      [{ csvText: 'x'.repeat(10 * 1024 * 1024 + 1), campaignId: 'camp-1' }, 413, 'too-big'],
    ];
    for (const [body, status, code] of cases) {
      const res = await POST(req(body));
      expect(res.status).toBe(status);
      expect((await res.json()).code).toBe(code);
    }
    expect(fake.commits).toEqual([]);
  });
});
