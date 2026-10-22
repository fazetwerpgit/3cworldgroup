// Bookings, cancels and slots with a consultant who connected Google Calendar
// (lib/solar/google). Google is the fake in lib/solar/testing/fakeGoogle.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { PATCH } from './[id]/route';
import { GET as availability } from '../availability/route';
import { PATCH as patchLead } from '../leads/[id]/route';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { sendEmail } from '@/lib/email/sendEmail';
import { createNotification, createNotificationForMany } from '@/lib/notifications/createNotification';
import type { createFakeDb } from '@/lib/solar/testing/fakeDb';
import { createFakeGoogle, type FakeGoogle } from '@/lib/solar/testing/fakeGoogle';
import { encryptToken } from '@/lib/solar/google/crypto';
import { resetAccessTokenCache } from '@/lib/solar/google/connection';
import { resetFreeBusyCache } from '@/lib/solar/google/freeBusy';
import { bookingEventId } from '@/lib/solar/google/calendar';

const db = adminDb as unknown as ReturnType<typeof createFakeDb>;
const mockGate = requireVerifiedUser as unknown as ReturnType<typeof vi.fn>;
const mockEmail = sendEmail as unknown as ReturnType<typeof vi.fn>;
let google: FakeGoogle;

const REP = { ok: true, uid: 'rep1', name: 'Rep One', email: 'rep@x.com', isAdmin: false, isOwner: false, solarRole: 'canvass_closer' };
const ADMIN = { ...REP, uid: 'boss', name: 'Boss', isAdmin: true };
const SLOT = '2026-10-26T15:00:00.000Z'; // Monday 8:00 AM PDT
const ID = `sam_${SLOT}`;
const NOW = new Date('2026-10-20T00:00:00Z');
// A Mountain homeowner (PT + 1): every Pacific 8 AM - 7 PM start lands in the
// 9 AM - 8 PM homeowner cap, so these tests see each consultant's full hours.
const MON = 'from=2026-10-26T07:00:00.000Z&to=2026-10-27T07:00:00.000Z&tz=America/Denver';
const HOURS = [{ day: 1, start: '08:00', end: '12:00' }];
const LIVE = { connected: true, email: 'sam@gmail.com', connectedAt: new Date('2026-10-19T00:00:00Z'), freeBusy: true };

function sam(googleCalendar?: Record<string, unknown>) {
  db.store.set(
    'solarAvailability',
    new Map([
      [
        'sam',
        {
          name: 'Sam Closer',
          tz: 'America/Los_Angeles',
          slotMin: 60,
          modes: { virtual: HOURS, in_person: HOURS },
          meetLink: 'https://meet.google.com/abc-defg-hij',
          phone: '+15125550199',
          ...(googleCalendar ? { googleCalendar } : {}),
        },
      ],
    ])
  );
  if (googleCalendar) {
    db.store.set('solarGoogleTokens', new Map([['sam', { refreshToken: encryptToken('refresh-1', 'sam'), status: 'ok' }]]));
  }
}

const book = (mode: 'virtual' | 'in_person' = 'virtual') =>
  POST(
    new NextRequest('http://localhost/api/portal/solar/bookings', {
      method: 'POST',
      body: JSON.stringify({ leadId: 'rep1_c1', mode, consultantUid: 'sam', start: SLOT }),
    })
  );
const emailTo = (to: string) => mockEmail.mock.calls.map((c) => c[0]).find((m) => m.to === to);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_ID', 'client-id.apps.googleusercontent.com');
  vi.stubEnv('GOOGLE_OAUTH_CLIENT_SECRET', 'test-client-secret');
  vi.stubEnv('APP_BASE_URL', 'https://www.3cworldgroup.com');
  db.store.clear();
  db.store.set('users', new Map(Object.entries({
    rep1: { displayName: 'Rep One', solarRole: 'canvass_closer' },
    sam: { displayName: 'Sam Closer', Email: 'sam@3cworldgroup.com', role: 'admin' },
    own: { displayName: 'Owner', Email: 'owner@3cworldgroup.com', role: 'owner' },
    jac: { displayName: 'Jacob', Email: 'jmyers@3cworldgroup.com', role: 'owner' },
  })));
  db.store.set('solarLeads', new Map(Object.entries({
    rep1_c1: {
      repUid: 'rep1', first: 'Ana', last: 'Lopez', email: 'ana@example.com', phone: '+15125550142',
      address: '12 Elm St', city: 'Austin', state: 'TX', zip: '78701', status: 'new',
    },
  })));
  google = createFakeGoogle();
  vi.stubGlobal('fetch', google.fetch);
  resetAccessTokenCache();
  resetFreeBusyCache();
  mockGate.mockReset().mockResolvedValue(REP);
  mockEmail.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('booking with Google Calendar connected', () => {
  it('virtual: the event invites the homeowner with a new Meet link, and no .ics rides on the emails', async () => {
    sam(LIVE);
    const res = await book('virtual');
    expect(res.status).toBe(200);

    const insert = google.find('POST', '/calendars/primary/events')!;
    expect(insert.url).toContain('conferenceDataVersion=1');
    expect(insert.url).toContain('sendUpdates=all');
    expect(insert.body).toMatchObject({
      id: bookingEventId(ID, NOW.getTime()),
      summary: 'Solar consultation: Ana Lopez',
      start: { dateTime: SLOT, timeZone: 'America/Los_Angeles' },
      attendees: [{ email: 'ana@example.com', displayName: 'Ana Lopez' }],
      conferenceData: { createRequest: { conferenceSolutionKey: { type: 'hangoutsMeet' } } },
    });
    // The homeowner sees the description: nothing internal in the event body.
    const body = JSON.stringify(insert.body);
    expect(String(insert.body!.description)).toContain('Solar consultation with 3C World Group.');
    expect(String(insert.body!.description)).toContain('Call or text Sam at (512) 555-0199.');
    expect(body).not.toContain('/portal/');
    expect(body).not.toContain('tab=leads');
    expect(body).not.toMatch(/555-?0142|5125550142/);
    expect(String(insert.body!.description)).not.toContain('12 Elm');

    expect(db.store.get('solarBookings')!.get(ID)).toMatchObject({
      googleEventId: bookingEventId(ID, NOW.getTime()),
      googleMeetLink: 'https://meet.google.com/new-meet-abc',
      googleEventState: 'confirmed',
    });

    const toCustomer = emailTo('ana@example.com');
    expect(toCustomer.attachments).toBeUndefined();
    expect(toCustomer.htmlBody).toContain('https://meet.google.com/new-meet-abc');
    expect(toCustomer.htmlBody).not.toContain('abc-defg-hij');
    expect(toCustomer.textBody).toContain('Google Calendar invite');
    expect(toCustomer.textBody).not.toContain('attached invite');
    const toConsultant = emailTo('sam@3cworldgroup.com');
    expect(toConsultant.attachments).toBeUndefined();
  });

  it('in person: the address is the location, no Meet is made', async () => {
    sam(LIVE);
    expect((await book('in_person')).status).toBe(200);
    const insert = google.find('POST', '/calendars/primary/events')!;
    expect(insert.body!.location).toBe('12 Elm St, Austin, TX, 78701');
    expect(insert.body!.conferenceData).toBeUndefined();
    const body = JSON.stringify(insert.body);
    expect(body).not.toContain('/portal/');
    expect(body).not.toMatch(/555-?0142|5125550142/);
    expect(db.store.get('solarBookings')!.get(ID)!.googleMeetLink).toBeUndefined();
  });

  it('Google failing never fails the booking: emails fall back to the .ics and the saved Meet link', async () => {
    sam(LIVE);
    google.insert = 'error';
    const res = await book('virtual');
    expect(res.status).toBe(200);
    expect(db.store.get('solarBookings')!.get(ID)).toMatchObject({ status: 'booked' });
    expect(db.store.get('solarBookings')!.get(ID)!.googleEventId).toBeUndefined();
    const toCustomer = emailTo('ana@example.com');
    expect(toCustomer.attachments).toHaveLength(1);
    expect(toCustomer.htmlBody).toContain('https://meet.google.com/abc-defg-hij');
    expect(toCustomer.textBody).toContain('attached invite');
    expect(emailTo('sam@3cworldgroup.com').attachments).toHaveLength(1);
  });

  it('a timed-out insert is taken down again, so the homeowner never gets both invites', async () => {
    sam(LIVE);
    google.insert = 'timeout';
    expect((await book('virtual')).status).toBe(200);
    // Quietly: the homeowner gets no invite-then-cancel, only our .ics.
    expect(google.find('DELETE', `/events/${bookingEventId(ID, NOW.getTime())}`)!.url).toContain('sendUpdates=none');
    expect(emailTo('ana@example.com').attachments).toHaveLength(1);
  });

  it('Google past the ~10s budget: the booking goes out with the .ics, and the maybe-made event is taken down quietly', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    vi.setSystemTime(NOW);
    sam(LIVE);
    google.insert = 'hang';
    let settled = false;
    const pending = book('virtual').then((res) => {
      settled = true;
      return res;
    });
    await vi.advanceTimersByTimeAsync(9_000);
    expect(settled).toBe(false);
    expect(google.find('POST', '/calendars/primary/events')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(1_500);
    const res = await pending;
    expect(res.status).toBe(200);
    expect(google.find('DELETE', `/events/${bookingEventId(ID, NOW.getTime())}`)!.url).toContain('sendUpdates=none');
    expect(db.store.get('solarBookings')!.get(ID)!.googleEventId).toBeUndefined();
    const toCustomer = emailTo('ana@example.com');
    expect(toCustomer.attachments).toHaveLength(1);
    expect(toCustomer.textBody).not.toContain('Google Calendar invite');
  });

  it('the route asks for enough time for Google and the emails', async () => {
    expect((await import('./route')).maxDuration).toBe(30);
  });

  it('a broken refresh token: booked as usual with the .ics, and the card says reconnect', async () => {
    sam(LIVE);
    google.refresh = 'invalid_grant';
    expect((await book('virtual')).status).toBe(200);
    expect(emailTo('ana@example.com').attachments).toHaveLength(1);
    expect(db.store.get('solarAvailability')!.get('sam')!.googleCalendar).toMatchObject({ connected: false, needsReconnect: true });
  });

  it('not connected: no Google call at all', async () => {
    sam();
    expect((await book('virtual')).status).toBe(200);
    expect(google.requests).toHaveLength(0);
    expect(emailTo('ana@example.com').attachments).toHaveLength(1);
  });

  it('a retried POST answers the same booking and makes no second event', async () => {
    sam(LIVE);
    await book('virtual');
    const again = await book('virtual');
    expect(await again.json()).toMatchObject({ duplicate: true, id: ID });
    expect(google.all('POST', '/calendars/primary/events')).toHaveLength(1);
  });
});

describe('the Meet links in the POST response (3C Doors app)', () => {
  const OWN_MEET = 'https://meet.google.com/abc-defg-hij';
  const GOOGLE_MEET = 'https://meet.google.com/new-meet-abc';

  it('fresh virtual booking with Google: both links', async () => {
    sam(LIVE);
    const body = await (await book('virtual')).json();
    expect(body).toMatchObject({ success: true, id: ID, mode: 'virtual', consultantMeetLink: OWN_MEET, googleMeetLink: GOOGLE_MEET });
    expect(body.duplicate).toBeUndefined();
  });

  it('fresh virtual booking without Google: only the consultant link', async () => {
    sam();
    const body = await (await book('virtual')).json();
    expect(body.consultantMeetLink).toBe(OWN_MEET);
    expect(body).not.toHaveProperty('googleMeetLink');
  });

  it('fresh virtual booking where Google failed: only the consultant link', async () => {
    sam(LIVE);
    google.insert = 'error';
    const body = await (await book('virtual')).json();
    expect(body.consultantMeetLink).toBe(OWN_MEET);
    expect(body).not.toHaveProperty('googleMeetLink');
  });

  it('in person: neither link, even with Google', async () => {
    sam(LIVE);
    const body = await (await book('in_person')).json();
    expect(body).not.toHaveProperty('consultantMeetLink');
    expect(body).not.toHaveProperty('googleMeetLink');
  });

  it('a consultant without a Meet link and no Google: neither link', async () => {
    sam();
    delete db.store.get('solarAvailability')!.get('sam')!.meetLink;
    const body = await (await book('virtual')).json();
    expect(body).not.toHaveProperty('consultantMeetLink');
    expect(body).not.toHaveProperty('googleMeetLink');
  });

  it('a duplicate answers the stored links, the same as the first response', async () => {
    sam(LIVE);
    const first = await (await book('virtual')).json();
    const again = await (await book('virtual')).json();
    expect(again).toEqual({ ...first, duplicate: true });
    expect(again).toMatchObject({ consultantMeetLink: OWN_MEET, googleMeetLink: GOOGLE_MEET });
  });

  it('a duplicate omits empty or missing stored links', async () => {
    sam();
    await book('virtual');
    Object.assign(db.store.get('solarBookings')!.get(ID)!, { consultantMeetLink: '', googleMeetLink: '  ' });
    const again = await (await book('virtual')).json();
    expect(again.duplicate).toBe(true);
    expect(again).not.toHaveProperty('consultantMeetLink');
    expect(again).not.toHaveProperty('googleMeetLink');
  });
});

describe('booking-time free/busy re-check', () => {
  it('busy on Google now: 409 slot_taken and nothing is booked', async () => {
    sam(LIVE);
    google.freeBusy = [{ start: '2026-10-26T15:30:00Z', end: '2026-10-26T16:00:00Z' }];
    const res = await book('virtual');
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: 'slot_taken' });
    expect(db.store.get('solarBookings')?.size ?? 0).toBe(0);
  });

  it('free/busy erroring does not block the booking', async () => {
    sam(LIVE);
    google.freeBusy = 'error';
    expect((await book('virtual')).status).toBe(200);
  });

  it('free/busy not granted: not asked', async () => {
    sam({ ...LIVE, freeBusy: false });
    expect((await book('virtual')).status).toBe(200);
    expect(google.find('POST', '/freeBusy')).toBeUndefined();
  });
});

describe('cancelling deletes the Google event (Google tells the homeowner)', () => {
  async function booked() {
    sam(LIVE);
    await book('virtual');
    google.requests.length = 0;
  }
  const eventId = () => bookingEventId(ID, NOW.getTime());

  it('admin cancel (PATCH bookings/{id})', async () => {
    await booked();
    mockGate.mockResolvedValue(ADMIN);
    const res = await PATCH(
      new NextRequest(`http://localhost/api/portal/solar/bookings/${ID}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    const del = google.find('DELETE', `/calendars/primary/events/${eventId()}`)!;
    expect(del.url).toContain('sendUpdates=all');
  });

  it('no sale on the lead (PATCH leads/{id} {noSaleReason})', async () => {
    await booked();
    const res = await patchLead(
      new NextRequest('http://localhost/api/portal/solar/leads/rep1_c1', { method: 'PATCH', body: JSON.stringify({ noSaleReason: 'low_credit' }) }),
      { params: Promise.resolve({ id: 'rep1_c1' }) }
    );
    expect(res.status).toBe(200);
    expect(google.find('DELETE', `/calendars/primary/events/${eventId()}`)).toBeTruthy();
  });

  it('Google down: the cancel still goes through', async () => {
    await booked();
    google.deleteStatus = 500;
    mockGate.mockResolvedValue(ADMIN);
    const res = await PATCH(
      new NextRequest(`http://localhost/api/portal/solar/bookings/${ID}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    expect(db.store.get('solarBookings')!.get(ID)!.status).toBe('cancelled');
  });

  it('a booking without an event makes no Google call', async () => {
    sam();
    await book('virtual');
    mockGate.mockResolvedValue(ADMIN);
    await PATCH(
      new NextRequest(`http://localhost/api/portal/solar/bookings/${ID}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(google.requests).toHaveLength(0);
  });
});

describe('a contact fix on a booked lead follows to the event', () => {
  it('patches the title and swaps only the homeowner invitee (sendUpdates=all)', async () => {
    sam(LIVE);
    await book('virtual');
    // The consultant added a colleague to the event by hand.
    const event = google.events.get(bookingEventId(ID, NOW.getTime()))!;
    event.attendees = [...(event.attendees as object[]), { email: 'helper@3cworldgroup.com', responseStatus: 'accepted' }];
    const res = await patchLead(
      new NextRequest('http://localhost/api/portal/solar/leads/rep1_c1', {
        method: 'PATCH',
        body: JSON.stringify({ first: 'Ana', last: 'Lopez-Diaz', email: 'ana.lopez@example.com', phone: '+15125550142' }),
      }),
      { params: Promise.resolve({ id: 'rep1_c1' }) }
    );
    expect(res.status).toBe(200);
    const patch = google.find('PATCH', `/calendars/primary/events/${bookingEventId(ID, NOW.getTime())}`)!;
    expect(patch.url).toContain('sendUpdates=all');
    expect(patch.body).toEqual({
      summary: 'Solar consultation: Ana Lopez-Diaz',
      attendees: [
        { email: 'helper@3cworldgroup.com', responseStatus: 'accepted' },
        { email: 'ana.lopez@example.com', displayName: 'Ana Lopez-Diaz' },
      ],
      extendedProperties: { private: { solarBookingId: ID, solarHomeownerEmail: 'ana.lopez@example.com' } },
    });
  });
});

describe('slots filtered by Google free/busy', () => {
  const starts = async () =>
    ((await (await availability(new NextRequest(`http://localhost/api/portal/solar/availability?mode=virtual&${MON}`))).json()).slots as {
      start: string;
    }[]).map((s) => s.start);

  it('drops the slots the consultant is busy for', async () => {
    sam(LIVE);
    google.freeBusy = [{ start: '2026-10-26T16:15:00Z', end: '2026-10-26T16:45:00Z' }];
    expect(await starts()).toEqual(['2026-10-26T15:00:00.000Z', '2026-10-26T17:00:00.000Z', '2026-10-26T18:00:00.000Z']);
  });

  it("a portal booking and its own Google event over one slot remove it once, nothing more", async () => {
    sam(LIVE);
    db.store.set('solarBookings', new Map([[ID, { consultantUid: 'sam', start: SLOT, end: '2026-10-26T16:00:00.000Z', status: 'booked' }]]));
    google.freeBusy = [{ start: SLOT, end: '2026-10-26T16:00:00Z' }];
    expect(await starts()).toEqual(['2026-10-26T16:00:00.000Z', '2026-10-26T17:00:00.000Z', '2026-10-26T18:00:00.000Z']);
  });

  it('Google erroring: every slot stays', async () => {
    sam(LIVE);
    google.freeBusy = 'error';
    expect(await starts()).toHaveLength(4);
  });
});

describe('a QA test account booking (testAccount)', () => {
  const QA = { ...REP, uid: 'qa', name: 'Test Closer', testAccount: true };
  const mockNotify = createNotification as unknown as ReturnType<typeof vi.fn>;
  const mockNotifyMany = createNotificationForMany as unknown as ReturnType<typeof vi.fn>;
  const bookQa = (consultantUid = 'sam') =>
    POST(
      new NextRequest('http://localhost/api/portal/solar/bookings', {
        method: 'POST',
        body: JSON.stringify({ leadId: 'qa_c1', mode: 'virtual', consultantUid, start: SLOT }),
      })
    );

  beforeEach(() => {
    mockGate.mockResolvedValue(QA);
    mockNotify.mockClear();
    mockNotifyMany.mockClear();
    db.store.get('users')!.set('qa', { displayName: 'Test Closer', Email: 'qa@example.test', solarRole: 'canvass_closer', testAccount: true });
    db.store.get('solarLeads')!.set('qa_c1', {
      repUid: 'qa', first: 'Ann', last: 'Test', email: 'homeowner@example.com', state: 'TX', status: 'new', testAccount: true,
    });
  });

  it('with a real consultant: stamped, no Google event, no homeowner email, no consultant notice, no lead alert', async () => {
    sam(LIVE);
    const res = await bookQa();
    expect(res.status).toBe(200);
    expect(db.store.get('solarBookings')!.get(ID)).toMatchObject({ repUid: 'qa', testAccount: true, status: 'booked' });
    expect(google.find('POST', '/calendars/primary/events')).toBeUndefined();
    expect(mockEmail).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockNotifyMany).not.toHaveBeenCalled();
    // Claimed once, so a later finish sends nothing either.
    expect(db.store.get('solarLeads')!.get('qa_c1')!.alertSentAt).toBeInstanceOf(Date);
  });

  it('with a test consultant: only the consultant notice, straight to them', async () => {
    sam();
    db.store.get('users')!.set('sam', { displayName: 'Sam Closer', Email: 'sam-qa@example.test', testAccount: true });
    expect((await bookQa()).status).toBe(200);
    expect(mockEmail.mock.calls.map((c) => c[0].to)).toEqual(['sam-qa@example.test']);
    expect(mockNotify.mock.calls.map((c) => c[0].userId)).toEqual(['sam']);
    expect(mockNotifyMany).not.toHaveBeenCalled();
  });

  it('a cancel emails no homeowner and notifies no real consultant', async () => {
    sam();
    expect((await bookQa()).status).toBe(200);
    mockEmail.mockClear();
    mockNotify.mockClear();
    mockGate.mockResolvedValue({ ...QA, uid: 'boss', isAdmin: true });
    const res = await PATCH(
      new NextRequest(`http://localhost/api/portal/solar/bookings/${ID}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'cancelled' }),
      }),
      { params: Promise.resolve({ id: ID }) }
    );
    expect(res.status).toBe(200);
    expect(mockEmail).not.toHaveBeenCalled();
    // Only the test rep who booked it hears about it.
    expect(mockNotify.mock.calls.map((c) => c[0].userId)).toEqual(['qa']);
  });
});

