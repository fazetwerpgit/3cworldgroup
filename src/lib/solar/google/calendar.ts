// Google Calendar REST calls for solar bookings: the event payload (pure),
// insert / get / delete / patch on the consultant's primary calendar, and
// free/busy. Server only. Every call is best effort: failures return a
// result the caller can fall back on, never throw.
import { createHash } from 'node:crypto';
import { displayPhone } from '@/lib/phone';
import { firstName } from '@/lib/solar/consultantContact';
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
  /** In person: the event's location. Never put in the description. */
  address: string;
  /** The consultant, for the homeowner's "call or text" line. */
  consultantName: string;
  /** '' when not set: then the line is left out. */
  consultantPhone: string;
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

// The homeowner is an attendee and sees this description, so it carries
// nothing internal: no lead link, no homeowner phone or address (the
// consultant gets those in the booking notice email). Virtual: Google adds
// its own Meet line, so none here.
function eventDescription(i: BookingEventInput): string {
  const first = firstName(i.consultantName) || i.consultantName.trim() || 'your consultant';
  return [
    'Solar consultation with 3C World Group.',
    i.consultantPhone ? `Questions before then? Call or text ${first} at ${displayPhone(i.consultantPhone)}.` : '',
    'Reply to the invite to change the time.',
  ]
    .filter(Boolean)
    .join('\n\n');
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
    // Private: on the consultant's copy only. The homeowner's address is kept
    // so a contact fix replaces that one invitee and no one else.
    extendedProperties: { private: { solarBookingId: i.bookingId, ...(email ? { solarHomeownerEmail: email } : {}) } },
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
 * `budget` is the caller's overall deadline: once it fires, nothing new is sent
 * and a request in flight is cut off (reported as a timeout).
 */
async function call(
  uid: string,
  method: string,
  url: string,
  body?: unknown,
  timeoutMs = GOOGLE_TIMEOUT_MS,
  budget?: AbortSignal
): Promise<Call> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (budget?.aborted) return { status: 0, data: {}, timedOut: false };
    const token = await accessTokenFor(uid);
    if (!token) return { status: 0, data: {}, timedOut: false };
    if (budget?.aborted) return { status: 0, data: {}, timedOut: false };
    const timeout = AbortSignal.timeout(timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: budget ? AbortSignal.any([timeout, budget]) : timeout,
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
export async function insertBookingEvent(uid: string, input: BookingEventInput, budget?: AbortSignal): Promise<CreatedEvent> {
  const body = buildBookingEvent(input);
  const eventId = String(body.id);
  const inserted = await call(uid, 'POST', `${EVENTS}?conferenceDataVersion=1&sendUpdates=all`, body, GOOGLE_TIMEOUT_MS, budget);
  let event: Record<string, unknown> | null = null;
  if (inserted.status === 200 || inserted.status === 201) {
    event = inserted.data;
  } else if (inserted.status === 409) {
    const got = await call(uid, 'GET', `${EVENTS}/${eventId}`, undefined, GOOGLE_TIMEOUT_MS, budget);
    if (got.status === 200 && got.data.status !== 'cancelled') event = got.data;
  }
  if (!event) {
    console.error('google calendar: event insert failed', errorCode(inserted));
    return { ok: false, eventId, maybeCreated: inserted.status === 0 && inserted.timedOut === true };
  }
  let meetLink = meetLinkOf(event);
  // Meet creation can finish a moment after the insert answers.
  if (input.mode === 'virtual' && !meetLink && meetPending(event) && !budget?.aborted) {
    await wait(1500);
    const again = await call(uid, 'GET', `${EVENTS}/${eventId}`, undefined, 3000, budget);
    if (again.status === 200) meetLink = meetLinkOf(again.data);
  }
  return { ok: true, eventId: String(event.id ?? eventId), meetLink };
}

/**
 * Deletes the event. By default Google tells the homeowner (sendUpdates=all);
 * `quiet` sends nothing, for an event they were never meant to have.
 * True when it's gone (404 / 410: already gone counts).
 */
export async function deleteBookingEvent(
  uid: string,
  eventId: string,
  timeoutMs = GOOGLE_TIMEOUT_MS,
  { quiet = false }: { quiet?: boolean } = {}
): Promise<boolean> {
  const notify = quiet ? 'none' : 'all';
  const res = await call(uid, 'DELETE', `${EVENTS}/${encodeURIComponent(eventId)}?sendUpdates=${notify}`, undefined, timeoutMs);
  if (res.status === 204 || res.status === 200 || res.status === 404 || res.status === 410) return true;
  console.error('google calendar: event delete failed', errorCode(res));
  return false;
}

type Attendee = { email?: string; displayName?: string; [key: string]: unknown };

/**
 * A homeowner name/email fix after booking: the event's title and homeowner
 * invitee follow it (Google invites the new address and tells a replaced
 * one). Anyone the consultant added to the event themselves is kept: the
 * event is read first and only the homeowner we invited is swapped.
 */
export async function patchBookingEventContact(
  uid: string,
  eventId: string,
  contact: { customerName: string; customerEmail: string }
): Promise<boolean> {
  const email = contact.customerEmail.trim();
  const name = contact.customerName.trim();
  const url = `${EVENTS}/${encodeURIComponent(eventId)}`;
  const current = await call(uid, 'GET', url);
  if (current.status !== 200) {
    console.error('google calendar: event read before contact update failed', errorCode(current));
    return false;
  }
  const props = (current.data.extendedProperties ?? {}) as { private?: Record<string, string> };
  const priv = props.private ?? {};
  const previous = String(priv.solarHomeownerEmail ?? '').toLowerCase();
  const same = (a: Attendee, address: string) => !!address && String(a.email ?? '').toLowerCase() === address.toLowerCase();
  const existing = Array.isArray(current.data.attendees) ? (current.data.attendees as Attendee[]) : [];
  const others = existing.filter((a) => !same(a, previous) && !same(a, email));
  const kept = existing.find((a) => same(a, email));
  const attendees = email ? [...others, { ...(kept ?? {}), email, ...(name ? { displayName: name } : {}) }] : others;
  const { solarHomeownerEmail: _old, ...rest } = priv;
  void _old;
  const res = await call(uid, 'PATCH', `${url}?sendUpdates=all`, {
    summary: eventSummary(name),
    attendees,
    extendedProperties: { private: { ...rest, ...(email ? { solarHomeownerEmail: email } : {}) } },
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
