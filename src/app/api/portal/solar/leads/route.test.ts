import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
}));
vi.mock('@/lib/auth/requireVerifiedAdmin', () => ({ requireVerifiedUser: vi.fn() }));
vi.mock('@/lib/userRateLimits', () => ({ userRateLimited: vi.fn(() => null) }));
vi.mock('@/lib/notifications/createNotification', () => ({
  createNotification: vi.fn(async () => 'n1'),
  createNotificationForMany: vi.fn(async () => {}),
}));
vi.mock('@/lib/push/sendPush', () => ({ sendPushToUser: vi.fn(async () => {}) }));
vi.mock('@/lib/email/sendEmail', () => ({ sendEmail: vi.fn(async () => ({ ok: true })) }));

import { GET, POST } from './route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { userRateLimited } from '@/lib/userRateLimits';
import { createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockLimit = userRateLimited as unknown as ReturnType<typeof vi.fn>;
const mockNotify = createNotificationForMany as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'entry_canvasser' };
const UP = 'a'.repeat(32);
const UP2 = 'b'.repeat(32);
const VALID = {
  first: 'Ana',
  last: 'Lopez',
  address: '1 Main St',
  city: 'Fresno',
  state: 'CA',
  zip: '93701',
  phone: '(559) 555-0101',
  email: 'ana@example.com',
  monthlyBill: '$212.50',
  photos: { billPage1: `form-attachments/rep1/solar-lead/${UP}/billPage1/`, panel: `form-attachments/rep1/solar-lead/${UP}/panel/` },
};

function seed(users: Record<string, Record<string, unknown>>, extra: Record<string, Record<string, Record<string, unknown>>> = {}) {
  db.store.clear();
  db.store.set('users', new Map(Object.entries(users)));
  for (const [name, docs] of Object.entries(extra)) db.store.set(name, new Map(Object.entries(docs)));
}

const USERS = {
  rep1: { displayName: 'Rep One', email: 'rep@x.com', solarRole: 'entry_canvasser' },
  fiber: { displayName: 'Fiber Rep', email: 'f@x.com', fieldRole: 'ae_tier_1' },
  own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
  jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
};

function req(body: unknown, headers?: Record<string, string>) {
  return new NextRequest('http://localhost/api/portal/solar/leads', { method: 'POST', body: JSON.stringify(body), headers });
}

beforeEach(() => {
  seed(USERS);
  mockGate.mockReset().mockResolvedValue(REP);
  mockLimit.mockReset().mockReturnValue(null);
  mockNotify.mockClear();
  mockPush.mockClear();
  mockEmail.mockClear();
});

describe('POST /api/portal/solar/leads', () => {
  it('rejects an unauthenticated caller', async () => {
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await POST(req(VALID))).status).toBe(401);
  });

  it('403s a fiber rep with no solar role', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber', fieldRole: 'ae_tier_1', solarRole: null });
    expect((await POST(req(VALID))).status).toBe(403);
    expect(db.store.get('solarLeads')).toBeUndefined();
  });

  it('lets an admin without a solar role in', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'own', isAdmin: true, isOwner: true, role: 'owner', solarRole: null });
    expect((await POST(req({ ...VALID, photos: undefined }))).status).toBe(200);
  });

  it('returns the rate limiter response', async () => {
    mockLimit.mockReturnValue(new Response(null, { status: 429 }));
    expect((await POST(req(VALID))).status).toBe(429);
  });

  it('writes the lead stamped with the verified rep and sends no alert yet', async () => {
    const res = await POST(req({ ...VALID, uploadId: UP }));
    expect(res.status).toBe(200);
    const { id } = await res.json();
    const lead = db.store.get('solarLeads')!.get(id)!;
    expect(lead).toMatchObject({
      first: 'Ana',
      monthlyBill: 212.5,
      repUid: 'rep1',
      status: 'new',
      source: 'portal',
      creditTier: null,
      photos: VALID.photos,
      uploadId: UP,
    });
    expect(lead.alertSentAt).toBeUndefined();
    // The one alert goes out from POST bookings or POST leads/{id}/finish.
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockEmail).not.toHaveBeenCalled();
  });

  it('dedupes on clientId: same id back, one record', async () => {
    const a = await (await POST(req({ ...VALID, clientId: 'c-1' }))).json();
    const b = await (await POST(req({ ...VALID, clientId: 'c-1' }))).json();
    expect(a).toEqual({ success: true, id: 'rep1_c-1' });
    expect(b).toEqual(a);
    expect(db.store.get('solarLeads')!.size).toBe(1);
  });

  it('rejects a bad clientId', async () => {
    expect((await POST(req({ ...VALID, clientId: 'no spaces' }))).status).toBe(400);
  });

  it.each([
    ['missing name', { first: '' }],
    ['no contact', { phone: '', email: '' }],
    ['no email', { email: '' }],
    ['bad email', { email: 'nope' }],
    ['bad bill', { monthlyBill: 'lots' }],
    ['bad credit tier', { creditTier: 'gold' }],
    ['photo in another rep folder', { photos: { panel: `form-attachments/other/solar-lead/${UP}/panel/` } }],
    ['photo outside solar-lead', { photos: { panel: `form-attachments/rep1/payroll-dispute/${UP}/` } }],
    ['traversal photo path', { photos: { panel: 'form-attachments/rep1/solar-lead/../../x/' } }],
    ['photo without an upload id', { photos: { panel: 'form-attachments/rep1/solar-lead/panel/' } }],
    ['photo in the wrong slot', { photos: { panel: `form-attachments/rep1/solar-lead/${UP}/billGraph/` } }],
    ['photos from two upload ids', { photos: { billPage1: `form-attachments/rep1/solar-lead/${UP}/billPage1/`, panel: `form-attachments/rep1/solar-lead/${UP2}/panel/` } }],
    ['photo outside the sent uploadId', { uploadId: UP2 }],
    ['bad uploadId', { uploadId: 'nope' }],
  ])('400s on %s', async (_label, patch) => {
    expect((await POST(req({ ...VALID, ...patch }))).status).toBe(400);
    expect(db.store.get('solarLeads')).toBeUndefined();
  });

  it('stores the upload id so the photos are locked (sent, or read from the photo paths)', async () => {
    const sent = await (await POST(req({ ...VALID, uploadId: UP, clientId: 'c-a' }))).json();
    expect(db.store.get('solarLeads')!.get(sent.id)).toMatchObject({ uploadId: UP });
    const derived = await (await POST(req({ ...VALID, clientId: 'c-b' }))).json();
    expect(db.store.get('solarLeads')!.get(derived.id)).toMatchObject({ uploadId: UP });
    const noPhotos = await (await POST(req({ ...VALID, photos: undefined, uploadId: UP2, clientId: 'c-c' }))).json();
    expect(db.store.get('solarLeads')!.get(noPhotos.id)).toMatchObject({ uploadId: UP2, photos: {} });
  });

  it('marks 3C Doors leads as source knock', async () => {
    const { id } = await (await POST(req({ ...VALID, doorId: 'door9', creditTier: 'purchase_600' }))).json();
    expect(db.store.get('solarLeads')!.get(id)).toMatchObject({ source: 'knock', doorId: 'door9', creditTier: 'purchase_600' });
  });
});

describe('GET /api/portal/solar/leads', () => {
  const ADMIN = { ...REP, uid: 'adm', isAdmin: true, role: 'admin', solarRole: null };
  const get = () => GET(new NextRequest('http://localhost/api/portal/solar/leads'));
  const BOOKED = 'jac_2026-10-26T15:00:00.000Z';

  beforeEach(() => {
    seed(USERS, {
      solarLeads: {
        rep1_a: { repUid: 'rep1', repName: 'Rep One', first: 'Ana', last: 'Lopez', status: 'booked', bookingId: BOOKED,
          monthlyBill: 212.5, creditTier: 'purchase_600', photos: { panel: 'p/', bogus: 'x' }, createdAt: new Date('2026-10-18T10:00:00Z') },
        rep1_b: { repUid: 'rep1', repName: 'Rep One', first: 'Bo', last: 'Kim', status: 'booked', bookingId: 'gone',
          createdAt: new Date('2026-10-19T10:00:00Z') },
        rep2_a: { repUid: 'rep2', repName: 'Rep Two', first: 'Cy', last: 'Ng', status: 'sold', source: 'knock',
          createdAt: new Date('2026-10-17T10:00:00Z') },
        demo_a: { repUid: 'demo', first: 'Demo', last: 'Lead', status: 'demo', demoAccount: true, createdAt: new Date('2026-10-19T12:00:00Z') },
      },
      solarBookings: {
        [BOOKED]: { leadId: 'rep1_a', consultantUid: 'jac', consultantName: 'Jacob', mode: 'virtual',
          start: '2026-10-26T15:00:00.000Z', end: '2026-10-26T16:00:00.000Z', status: 'booked' },
        gone: { leadId: 'rep1_b', consultantUid: 'jac', start: '2026-10-27T15:00:00.000Z', status: 'cancelled' },
      },
    });
  });

  it('gives a rep only their own leads, newest first, each with its live booking', async () => {
    const res = await get();
    expect(res.status).toBe(200);
    const { leads } = await res.json();
    expect(leads.map((l: { id: string }) => l.id)).toEqual(['rep1_b', 'rep1_a']);
    expect(leads[1]).toMatchObject({
      status: 'booked', first: 'Ana', monthlyBill: 212.5, creditTier: 'purchase_600', photos: { panel: 'p/' },
      createdAt: '2026-10-18T10:00:00.000Z',
      booking: { id: BOOKED, consultantName: 'Jacob', mode: 'virtual', start: '2026-10-26T15:00:00.000Z', tz: 'America/Chicago' },
    });
    // A cancelled booking is no booking, and the lead reads new.
    expect(leads[0]).toMatchObject({ status: 'new', booking: null });
  });

  it("gives an admin every lead but demo accounts'", async () => {
    mockGate.mockResolvedValue(ADMIN);
    const { leads } = await (await get()).json();
    expect(leads.map((l: { id: string }) => l.id)).toEqual(['rep1_b', 'rep1_a', 'rep2_a']);
    expect(leads[2]).toMatchObject({ status: 'sold', source: 'knock', repName: 'Rep Two' });
  });

  it('403s a caller without solar access, 401s without a token', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber', fieldRole: 'ae_tier_1', solarRole: null });
    expect((await get()).status).toBe(403);
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await get()).status).toBe(401);
  });
});
