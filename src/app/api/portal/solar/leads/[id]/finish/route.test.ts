import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const bucket = vi.hoisted(() => ({
  getFiles: vi.fn(async ({ prefix }: { prefix: string }) => [
    prefix.includes('/billGraph/')
      ? []
      : [{ getSignedUrl: vi.fn(async (opts: Record<string, unknown>) => [`https://signed.example/${prefix}file.jpg?v=${opts.version}&a=1`]) }],
  ]),
}));

vi.mock('@/lib/firebase/admin', async () => ({
  adminDb: (await import('@/lib/solar/testing/fakeDb')).createFakeDb(),
  getOnboardingBucket: () => bucket,
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
import { createNotification, createNotificationForMany } from '@/lib/notifications/createNotification';
import { sendPushToUser } from '@/lib/push/sendPush';
import { sendEmail } from '@/lib/email/sendEmail';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockLimit = userRateLimited as unknown as ReturnType<typeof vi.fn>;
const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
const mockNotifyMany = createNotificationForMany as unknown as ReturnType<typeof vi.fn>;
const mockPush = sendPushToUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'entry_canvasser' };
const UP = 'a'.repeat(32);
const LEAD = {
  repUid: 'rep1',
  repName: 'Rep One',
  first: 'Ana',
  last: '<Lopez>',
  address: '1 Main St',
  city: 'Fresno',
  state: 'CA',
  zip: '93701',
  phone: '(559) 555-0101',
  email: 'ana@example.com',
  monthlyBill: 212.5,
  creditTier: 'lease_ppa_680',
  photos: {
    billPage1: `form-attachments/rep1/solar-lead/${UP}/billPage1/`,
    billGraph: `form-attachments/rep1/solar-lead/${UP}/billGraph/`,
    panel: `form-attachments/rep1/solar-lead/${UP}/panel/`,
  },
  uploadId: UP,
  status: 'new',
};

function finish(id = 'rep1_c1') {
  return POST(new NextRequest(`http://localhost/api/portal/solar/leads/${id}/finish`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { displayName: 'Rep One', solarRole: 'entry_canvasser' },
    rep2: { displayName: 'Rep Two', solarRole: 'entry_canvasser' },
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  db.store.set('solarLeads', new Map([['rep1_c1', { ...LEAD }]]));
  mockGate.mockReset().mockResolvedValue(REP);
  mockLimit.mockReset().mockReturnValue(null);
  for (const m of [mockNotify, mockNotifyMany, mockPush, mockEmail]) m.mockClear();
  bucket.getFiles.mockClear();
});

describe('POST /api/portal/solar/leads/{id}/finish', () => {
  it('sends the no-booking lead alert to Jacob only, with contact, bill, credit and signed photo links', async () => {
    const res = await finish();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, id: 'rep1_c1', sent: true });
    expect(db.store.get('solarLeads')!.get('rep1_c1')!.alertSentAt).toBeInstanceOf(Date);

    expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['jac']);
    expect(mockNotifyMany.mock.calls[0][1]).toMatchObject({ type: 'solar_lead', title: 'New solar lead', metadata: { leadId: 'rep1_c1' } });
    expect(mockPush.mock.calls.map((c) => c[0])).toEqual(['jac']);

    expect(mockEmail).toHaveBeenCalledTimes(1);
    const mail = mockEmail.mock.calls[0][0];
    expect(mail.to).toBe('jmyers@3cworldgroup.com');
    expect(mail.subject).toBe('New solar lead: Ana <Lopez>');
    for (const line of [
      'Address: 1 Main St, Fresno, CA, 93701',
      'Phone: (559) 555-0101',
      'Email: ana@example.com',
      'Monthly bill: $212.50',
      'Credit: Lease / PPA (680+)',
      'Appointment: No appointment booked',
      `Bill (first page): https://signed.example/form-attachments/rep1/solar-lead/${UP}/billPage1/file.jpg?v=v4&a=1`,
      'Electric panel: https://signed.example/',
    ]) {
      expect(mail.textBody).toContain(line);
    }
    // No file in the bar-graph folder: no link.
    expect(mail.textBody).not.toContain('Bill (bar graph)');
    // Everything in the HTML is escaped.
    expect(mail.htmlBody).toContain('Ana &lt;Lopez&gt;');
    expect(mail.htmlBody).not.toContain('<Lopez>');
    expect(mail.htmlBody).toContain('?v=v4&amp;a=1');
  });

  it('adds roof type, monthly kWh and a Needs review line when set, and leaves them out on an old lead', async () => {
    db.store.get('solarLeads')!.set('rep1_c1', {
      ...LEAD, roofType: 'concrete_tile', monthlyKwh: 1250, heavyShade: true, needsReview: true,
    });
    await finish('rep1_c1');
    const mail = mockEmail.mock.calls[0][0];
    expect(mail.textBody).toContain('Roof type: Concrete tile');
    expect(mail.textBody).toContain('Monthly usage: 1,250 kWh/mo');
    expect(mail.textBody).toContain('Needs review: Yes: heavy shade on the roof');
    expect(mail.htmlBody).toContain('Needs review');

    mockEmail.mockClear();
    db.store.get('solarLeads')!.set('rep1_c1', { ...LEAD });
    await finish('rep1_c1');
    const old = mockEmail.mock.calls[0][0];
    expect(old.textBody).not.toMatch(/Roof type|Monthly usage|Needs review/);
  });

  it('signs 7-day V4 read links for each photo folder', async () => {
    await finish();
    expect(bucket.getFiles.mock.calls.map((c) => c[0])).toEqual([
      { prefix: LEAD.photos.billPage1, delimiter: '/' },
      { prefix: LEAD.photos.billGraph, delimiter: '/' },
      { prefix: LEAD.photos.panel, delimiter: '/' },
    ]);
    const [files] = await bucket.getFiles.mock.results[0].value;
    const opts = files[0].getSignedUrl.mock.calls[0][0];
    expect(opts).toMatchObject({ version: 'v4', action: 'read' });
    const ttl = opts.expires - Date.now();
    expect(ttl).toBeGreaterThan(6.9 * 86_400_000);
    expect(ttl).toBeLessThanOrEqual(7 * 86_400_000);
  });

  it('includes the booking when the lead has one', async () => {
    db.store.set('solarBookings', new Map([[
      'own_2026-10-26T15:00:00.000Z',
      { start: '2026-10-26T15:00:00.000Z', mode: 'in_person', consultantName: 'Owner', status: 'booked' },
    ]]));
    db.store.get('solarLeads')!.set('rep1_c1', { ...LEAD, bookingId: 'own_2026-10-26T15:00:00.000Z' });
    await finish();
    const mail = mockEmail.mock.calls[0][0];
    expect(mail.subject).toBe('Solar appointment set: Ana <Lopez>');
    expect(mail.textBody).toContain('Appointment: Monday, October 26 at 8:00 AM PT, in-person, with Owner');
  });

  it('is idempotent: a second finish (or one after a booking alert) sends nothing', async () => {
    await finish();
    const again = await finish();
    expect(await again.json()).toEqual({ success: true, id: 'rep1_c1', sent: false });
    expect(mockNotifyMany).toHaveBeenCalledTimes(1);
    expect(mockEmail).toHaveBeenCalledTimes(1);
  });

  it('never reaches the owner by default, even with leadAlertUids set', async () => {
    db.store.set('settings', new Map([['solar', { leadAlertUids: ['own', 'jac'] }]]));
    await finish();
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['jac']);
    expect(mockPush.mock.calls.map((c) => c[0])).not.toContain('own');
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockEmail.mock.calls.map((c) => c[0].to)).not.toContain('owner@3cworldgroup.com');
  });

  it('uses leadAlertUids once owner notifications are on', async () => {
    db.store.set('settings', new Map([['solar', { notifyOwner: true, leadAlertUids: ['own', 'jac'] }]]));
    await finish();
    expect(mockNotifyMany.mock.calls[0][0]).toEqual(['own', 'jac']);
    expect(mockEmail.mock.calls.map((c) => c[0].to).sort()).toEqual(['jmyers@3cworldgroup.com', 'owner@3cworldgroup.com']);
  });

  it('still answers 200 when a message fails', async () => {
    mockNotifyMany.mockRejectedValueOnce(new Error('down'));
    mockEmail.mockRejectedValueOnce(new Error('down'));
    expect((await finish()).status).toBe(200);
  });

  it("403s another rep's lead, lets an admin finish it, 404s a missing lead", async () => {
    mockGate.mockResolvedValue({ ...REP, uid: 'rep2' });
    expect((await finish()).status).toBe(403);
    expect(mockEmail).not.toHaveBeenCalled();
    mockGate.mockResolvedValue({ ...REP, uid: 'jac', isAdmin: true, isOwner: true, role: 'owner', solarRole: null });
    expect((await finish()).status).toBe(200);
    expect((await finish('missing')).status).toBe(404);
    expect((await finish('bad id')).status).toBe(404);
  });

  it('returns 401 and 429 from the gates', async () => {
    mockLimit.mockReturnValueOnce(new Response(null, { status: 429 }));
    expect((await finish()).status).toBe(429);
    mockGate.mockResolvedValue({ ok: false, error: 'Missing authentication token', status: 401 });
    expect((await finish()).status).toBe(401);
  });
});
