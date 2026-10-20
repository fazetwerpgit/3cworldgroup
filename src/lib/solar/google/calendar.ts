// Google Calendar REST calls for solar bookings: the event payload (pure),
// insert / get / delete / patch on the consultant's primary calendar, and
// free/busy. Server only. Every call is best effort: failures return a
// result the caller can fall back on, never throw.
import { createHash } from 'node:crypto';
import { displayPhone } from '@/lib/phone';
import { accessTokenFor, rejectAccessToken } from './connection';
import { GOOGLE_TIMEOUT_MS } from './oauth';

const API = 'https://www.googleapis.com/calendar/v3';
const EVENTS = `${API}/calendars/primary/events`;

export interface BookingEventInput {
  bookingId: string;
  /** booking.createdAt in ms: with the id it makes the event id, so a re-booked slot gets a new event. */
  createdAtMs: number;
  mode: 'virtual' | 'in_person';
  /** UTC ISO instants. */
  start: string;
  end: string;
  /** The consultant's zone: the event shows in it. */
  timeZone: string;
  customerName: string;
  /** '' when the lead has none: then nobody is invited. */
  customerEmail: string;
  customerPhone: string;
  address: string;
  /** Full URL of the lead in the portal. */
  leadUrl: string;
}

/**
 * The Google event id for a booking: 32 lowercase hex chars (inside Google's
 * base32hex alphabet). Fixed per booking, so a retried insert answers 409
 * instead of creating a second event.
 */
export function bookingEventId(bookingId: string, createdAtMs: number): string {
  return createHash('sha256').update(`3c-solar|${bookingId}|${createdAtMs}`).digest('hex').slice(0, 32);
}

export function eventSummary(customerName: string): string {
  return `Solar consultation: ${customerName.trim() || 'Homeowner'}`;
}

function eventDescription(i: BookingEventInput): string {
  const details = [
    `Homeowner: ${i.customerName.trim() || 'Not given'}`,
    i.customerPhone ? `Phone: ${displayPhone(i.customerPhone)}` : '',
    i.address ? `Address: ${i.address}` : '',
    i.mode === 'virtual' ? 'Virtual consultation (Google Meet).' : 'In-person consultation at the address above.',
  ].filter(Boolean);
  return [...details, '', `Lead in the 3C portal: ${i.leadUrl}`].join('\n');
}

/** The events.insert body. Virtual: a new Meet link. In person: the address as location. */
export function buildBookingEvent(i: BookingEventInput): Record<string, unknown> {
  const id = bookingEventId(i.bookingId, i.createdAtMs);
  const email = i.customerEmail.trim();
  return {
    id,
    summary: eventSummary(i.customerName),
    description: eventDescription(i),
    start: { dateTime: i.start, timeZone: i.timeZone },
    end: { dateTime: i.end, timeZone: i.timeZone },
    ...(email ? { attendees: [{ email, ...(i.customerName.trim() ? { displayName: i.customerName.trim() } : {}) }] } : {}),
    ...(i.mode === 'virtual'
      ? { conferenceData: { createRequest: { requestId: id, conferenceSolutionKey: { type: 'hangoutsMeet' } } } }
      : i.address
        ? { location: i.address }
        : {}),
    guestsCanModify: false,
    guestsCanInviteOthers: false,
    extendedProperties: { private: { solarBookingId: i.bookingId } },
  };
}

/** The event's Meet link, or ''. */
export function meetLinkOf(event: Record<string, unknown>): string {
  if (typeof event.hangoutLink === 'string' && event.hangoutLink) return event.hangoutLink;
  const conf = event.conferenceData as { entryPoints?: { entryPointType?: string; uri?: string }[] } | undefined;
  const video = conf?.entryPoints?.find((e) => e.entryPointType === 'video' && typeof e.uri === 'string');
  return video?.uri ?? '';
}

function meetPending(event: Record<string, unknown>): boolean {
  const conf = event.conferenceData as { createRequest?: { status?: { statusCode?: string } } } | undefined;
  return conf?.createRequest?.status?.statusCode === 'pending';
}

/** status 0: no answer (data {}); timedOut tells a timeout from no token / a network error. */
type Call = { status: number; data: Record<string, unknown>; timedOut?: boolean };

/**
 * One authorized call to Google. A 401 drops the cached access token and tries
 * once more with a fresh one. status 0: no answer (no token, network, timeout).
 */
async function call(uid: string, method: string, url: string, body?: unknown, timeoutMs = GOOGLE_TIMEOUT_MS): Promise<Call> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessTokenFor(uid);
    if (!token) return { status: 0, data: {}, timedOut: false };
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(timeoutMs),
        cache: 'no-store',
      });
    } catch (error) {
      const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      return { status: 0, data: {}, timedOut };
    }
    if (res.status === 401 && attempt === 0) {
      rejectAccessToken(uid);
      continue;
    }
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, data: data ?? {} };
  }
  return { status: 0, data: {}, timedOut: false };
}

function errorCode(c: Call): string {
  if (c.status === 0) return c.timedOut ? 'timeout' : 'no answer';
  const err = (c.data.error ?? {}) as { status?: string; message?: string };
  return `${c.status} ${err.status ?? ''}`.trim();
}

export type CreatedEvent =
  | { ok: true; eventId: string; meetLink: string }
  /** maybeCreated: the insert got no answer, so Google may hold the event anyway. */
  | { ok: false; eventId: string; maybeCreated: boolean };

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Puts the booking on the consultant's primary calendar and invites the
 * homeowner (Google emails them the invite: sendUpdates=all). Virtual
 * bookings get a new Meet link. A retried insert finds the event already
 * there (409) and reads it instead.
 */
export async function insertBookingEvent(uid: string, input: BookingEventInput): Promise<CreatedEvent> {
  const body = buildBookingEvent(input);
  const eventId = String(body.id);
  const inserted = await call(uid, 'POST', `${EVENTS}?conferenceDataVersion=1&sendUpdates=all`, body);
  let event: Record<string, unknown> | null = null;
  if (inserted.status === 200 || inserted.status === 201) {
    event = inserted.data;
  } else if (inserted.status === 409) {
    const got = await call(uid, 'GET', `${EVENTS}/${eventId}`);
    if (got.status === 200 && got.data.status !== 'cancelled') event = got.data;
  }
  if (!event) {
    console.error('google calendar: event insert failed', errorCode(inserted));
    return { ok: false, eventId, maybeCreated: inserted.status === 0 && inserted.timedOut === true };
  }
  let meetLink = meetLinkOf(event);
  // Meet creation can finish a moment after the insert answers.
  if (input.mode === 'virtual' && !meetLink && meetPending(event)) {
    await wait(1500);
    const again = await call(uid, 'GET', `${EVENTS}/${eventId}`, undefined, 3000);
    if (again.status === 200) meetLink = meetLinkOf(again.data);
  }
  return { ok: true, eventId: String(event.id ?? eventId), meetLink };
}

/**
 * Deletes the event and lets Google tell the homeowner (sendUpdates=all).
 * True when it's gone (404 / 410: already gone counts).
 */
export async function deleteBookingEvent(uid: string, eventId: string, timeoutMs = GOOGLE_TIMEOUT_MS): Promise<boolean> {
  const res = await call(uid, 'DELETE', `${EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=all`, undefined, timeoutMs);
  if (res.status === 204 || res.status === 200 || res.status === 404 || res.status === 410) return true;
  console.error('google calendar: event delete failed', errorCode(res));
  return false;
}

/**
 * A homeowner name/email fix after booking: the event's title and invitee
 * follow it (Google invites the new address and tells a replaced one).
 */
export async function patchBookingEventContact(
  uid: string,
  eventId: string,
  contact: { customerName: string; customerEmail: string }
): Promise<boolean> {
  const email = contact.customerEmail.trim();
  const name = contact.customerName.trim();
  const res = await call(uid, 'PATCH', `${EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=all`, {
    summary: eventSummary(name),
    attendees: email ? [{ email, ...(name ? { displayName: name } : {}) }] : [],
  });
  if (res.status === 200) return true;
  console.error('google calendar: event contact update failed', errorCode(res));
  return false;
}

export interface BusyInterval {
  start: number;
  end: number;
}

/** Busy intervals on the primary calendar in [from, to), or null when Google didn't answer cleanly. */
export async function queryFreeBusy(uid: string, from: Date, to: Date): Promise<BusyInterval[] | null> {
  const res = await call(uid, 'POST', `${API}/freeBusy`, {
    timeMin: from.toISOString(),
    timeMax: to.toISOString(),
    items: [{ id: 'primary' }],
  });
  if (res.status !== 200) {
    console.error('google calendar: freeBusy failed', errorCode(res));
    return null;
  }
  const primary = (res.data.calendars as Record<string, { busy?: unknown; errors?: unknown[] }> | undefined)?.primary;
  if (!primary || (Array.isArray(primary.errors) && primary.errors.length > 0) || !Array.isArray(primary.busy)) {
    console.error('google calendar: freeBusy answered without the primary calendar');
    return null;
  }
  const out: BusyInterval[] = [];
  for (const b of primary.busy as { start?: unknown; end?: unknown }[]) {
    const start = typeof b?.start === 'string' ? Date.parse(b.start) : NaN;
    const end = typeof b?.end === 'string' ? Date.parse(b.end) : NaN;
    if (!Number.isNaN(start) && !Number.isNaN(end) && end > start) out.push({ start, end });
  }
  return out;
}
