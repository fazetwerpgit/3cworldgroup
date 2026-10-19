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

import { POST } from './route';
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

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false };
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
    mockGate.mockResolvedValue({ ...REP, uid: 'fiber' });
    expect((await POST(req(VALID))).status).toBe(403);
    expect(db.store.get('solarLeads')).toBeUndefined();
  });

  it('lets an admin without a solar role in', async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'own', isAdmin: true });
    expect((await POST(req({ ...VALID, photos: undefined }))).status).toBe(200);
  });

  it('returns the rate limiter response', async () => {
    mockLimit.mockReturnValue(new Response(null, { status: 429 }));
    expect((await POST(req(VALID))).status).toBe(429);
  });

  it('writes the lead stamped with the verified rep and alerts owner + Jacob', async () => {
    const res = await POST(req(VALID));
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
    });
    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify.mock.calls[0][0].sort()).toEqual(['jac', 'own']);
    expect(mockNotify.mock.calls[0][1]).toMatchObject({ type: 'solar_lead', link: '/portal/admin' });
    expect(mockPush).toHaveBeenCalledTimes(2);
    expect(mockEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(['jmyers@3cworldgroup.com', 'owner@3cworldgroup.com']);
    expect(mockEmail.mock.calls[0][0].htmlBody).toContain('Ana Lopez');
  });

  it('uses settings/solar.leadAlertUids when set', async () => {
    seed(USERS, { settings: { solar: { leadAlertUids: ['jac'] } } });
    await POST(req(VALID));
    expect(mockNotify.mock.calls[0][0]).toEqual(['jac']);
    expect(mockEmail).toHaveBeenCalledTimes(1);
  });

  it('dedupes on clientId: same id back, one record, one alert', async () => {
    const a = await (await POST(req({ ...VALID, clientId: 'c-1' }))).json();
    const b = await (await POST(req({ ...VALID, clientId: 'c-1' }))).json();
    expect(a).toEqual({ success: true, id: 'rep1_c-1' });
    expect(b).toEqual(a);
    expect(db.store.get('solarLeads')!.size).toBe(1);
    expect(mockNotify).toHaveBeenCalledTimes(1);
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

  it('still answers 200 when alerts fail', async () => {
    mockNotify.mockRejectedValueOnce(new Error('down'));
    mockEmail.mockRejectedValueOnce(new Error('down'));
    expect((await POST(req(VALID))).status).toBe(200);
  });
});
