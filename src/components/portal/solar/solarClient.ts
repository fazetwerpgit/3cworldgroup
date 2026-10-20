import { getIdToken } from '@/lib/firebase/getIdToken';
import { randomHex } from '@/lib/randomHex';
import type { SolarLeadView } from '@/lib/solar/leadView';
import type { SolarLeadStatus } from '@/lib/solar/leadFields';
import { dayKeyIn, dayLabelIn, timeIn, withinBookingWindow, zoneAbbr } from '@/lib/solar/timezones';

// Client half of the solar deck: the authed calls to /api/portal/solar/** and
// the pure formatting helpers the slides share (tested in solarClient.test.ts).

/** The default zone for the helpers below; the booking slide passes the customer's. */
export const SOLAR_TZ = 'America/Los_Angeles';

export type SolarMode = 'virtual' | 'in_person';
export type CreditTier = 'purchase_600' | 'lease_ppa_680';
export type PhotoSlot = 'billPage1' | 'billGraph' | 'panel';

export type SolarSlot = { consultantUid: string; name: string; start: string; end: string };

/**
 * One bookable time. `candidates` are the consultants free then, in the
 * server's booking preference order (see orderByPreference): book the first,
 * fall back to the next on a 409.
 */
export type SlotTime = { start: string; candidates: SolarSlot[] };

export type SlotDay = { key: string; label: string; times: SlotTime[] };

export const PHOTO_SLOTS: { slot: PhotoSlot; label: string }[] = [
  { slot: 'billPage1', label: 'Bill Upload (First Page)' },
  { slot: 'billGraph', label: 'Bill Upload (Bar Graph)' },
  { slot: 'panel', label: 'Photo of Electric Panel Upload (to know if we need to upgrade)' },
];

/** One id per deck session, so a retried lead POST dedupes. Matches ^[A-Za-z0-9_-]{1,128}$. */
export function newDeckClientId(): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().replace(/-/g, '')
      : randomHex();
  return `deck_${uuid}`;
}

export const CLIENT_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

const wholeDollars = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

/** $88,218 (rounded to the dollar). */
export function formatWholeDollars(value: number): string {
  return wholeDollars.format(Math.round(Number.isFinite(value) ? value : 0));
}

/** 2026-10-20 for the calendar day the instant falls on in `tz` (Pacific by default). */
export function pacificDayKey(iso: string, tz: string = SOLAR_TZ): string {
  return dayKeyIn(iso, tz);
}

/** "9:00 AM" in `tz` (the customer's zone on the booking slide). */
export function formatSlotTime(iso: string, tz: string = SOLAR_TZ): string {
  return timeIn(iso, tz);
}

/** "Tuesday, Oct 20 at 9:00 AM ET" in `tz`, with its zone label. */
export function formatSlotLong(iso: string, tz: string = SOLAR_TZ): string {
  return `${dayLabelIn(iso, tz)} at ${timeIn(iso, tz)} ${zoneAbbr(tz, iso)}`;
}

/**
 * Slots grouped by calendar day in `tz` (the customer's zone), then by start:
 * each time shows once. The sort is stable, so consultants that share a start
 * keep the server's preference order.
 */
export function groupSlotsByDay(slots: SolarSlot[], tz: string = SOLAR_TZ): SlotDay[] {
  const sorted = [...slots].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
  const days: SlotDay[] = [];
  for (const slot of sorted) {
    const key = dayKeyIn(slot.start, tz);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabelIn(slot.start, tz), times: [] };
      days.push(day);
    }
    const time = day.times[day.times.length - 1];
    if (time && Date.parse(time.start) === Date.parse(slot.start)) time.candidates.push(slot);
    else day.times.push({ start: slot.start, candidates: [slot] });
  }
  return days;
}

/** Only slots inside the booking window (through day 14 in `tz`); the server enforces it too. */
export function slotsInWindow(slots: SolarSlot[], tz: string, now: Date = new Date()): SolarSlot[] {
  return slots.filter((x) => withinBookingWindow(new Date(x.start), now, tz));
}

export type LeadFields = {
  first: string;
  last: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
};

export const EMPTY_LEAD: LeadFields = {
  first: '', last: '', address: '', city: '', state: '', zip: '', phone: '', email: '',
};

/** Inline errors for the lead form; an empty object means it can be sent. */
export function validateLead(f: LeadFields): Partial<Record<keyof LeadFields, string>> {
  const e: Partial<Record<keyof LeadFields, string>> = {};
  if (!f.first.trim()) e.first = 'Add a first name';
  if (!f.last.trim()) e.last = 'Add a last name';
  if (!f.address.trim()) e.address = 'Add the street address';
  if (!f.city.trim()) e.city = 'Add the city';
  if (!/^[A-Za-z]{2}$/.test(f.state.trim())) e.state = 'Two letters, like CA';
  if (!/^\d{5}(-\d{4})?$/.test(f.zip.trim())) e.zip = 'Five digits';
  if (f.phone.replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '').length !== 10) e.phone = 'Ten digits';
  if (!f.email.trim()) e.email = 'Add an email';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email.trim())) e.email = 'Check the email';
  return e;
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = await getIdToken();
  const headers: Record<string, string> = json ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  return headers;
}

export async function solarAuthHeaders(): Promise<HeadersInit> {
  return authHeaders(false);
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

async function call<T>(url: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, { ...init, headers: { ...(await authHeaders()), ...(init.headers ?? {}) } });
    const body = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
    if (!res.ok) return { ok: false, status: res.status, error: body?.error || `Request failed (${res.status})` };
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0, error: 'No connection. Try again.' };
  }
}

export function createLead(payload: LeadFields & {
  clientId: string;
  uploadId: string;
  monthlyBill: number;
  photos: Partial<Record<PhotoSlot, string>>;
}) {
  return call<{ success: boolean; id: string }>('/api/portal/solar/leads', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function setCreditTier(id: string, creditTier: CreditTier) {
  return call<{ success?: boolean }>(`/api/portal/solar/leads/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ creditTier }),
  });
}

/** `tz`: the customer's zone, which the server's 14-day window counts days in. */
export function fetchAvailability(mode: SolarMode, from: Date, to: Date, tz?: string) {
  const q = new URLSearchParams({ mode, from: from.toISOString(), to: to.toISOString(), ...(tz ? { tz } : {}) });
  return call<{ slots: SolarSlot[] }>(`/api/portal/solar/availability?${q}`);
}

/** The booking the server holds for the lead (on a retry, `duplicate` and possibly another slot). */
export type BookingResponse = {
  id: string;
  consultantUid?: string;
  consultantName?: string;
  start?: string;
  mode?: SolarMode;
  customerTz?: string;
  duplicate?: boolean;
};

export function createBooking(payload: {
  leadId: string;
  mode: SolarMode;
  consultantUid: string;
  start: string;
  customerTz?: string;
}) {
  return call<BookingResponse>('/api/portal/solar/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export type BookTimeResult =
  | { ok: true; id: string; slot: SolarSlot; customerTz?: string }
  | { ok: false; taken: boolean; error: string };

/**
 * Books `time` with its first free consultant. When that one answers 409 (just
 * taken), retries once with the next consultant free at that time before
 * reporting the time as taken.
 */
export async function bookTime(
  time: SlotTime,
  leadId: string,
  mode: SolarMode,
  book: typeof createBooking = createBooking,
  customerTz?: string
): Promise<BookTimeResult> {
  for (const slot of time.candidates.slice(0, 2)) {
    const res = await book({
      leadId,
      mode,
      consultantUid: slot.consultantUid,
      start: slot.start,
      ...(customerTz ? { customerTz } : {}),
    });
    if (res.ok) {
      // A retry answers the lead's existing booking: show that one.
      const d = res.data;
      const held =
        d.start && d.consultantUid
          ? { consultantUid: d.consultantUid, name: d.consultantName || slot.name, start: d.start, end: d.start === slot.start ? slot.end : '' }
          : slot;
      return { ok: true, id: d.id, slot: held, ...(d.customerTz ? { customerTz: d.customerTz } : {}) };
    }
    if (res.status === 400 && res.error === 'slot_unavailable') {
      return { ok: false, taken: false, error: 'That time is no longer offered. Pick another within the next 14 days.' };
    }
    if (res.status !== 409) return { ok: false, taken: false, error: res.error };
  }
  return { ok: false, taken: true, error: 'slot_taken' };
}

/**
 * Tells the server the rep is done with this homeowner, so the lead alert goes
 * out if a booking hasn't sent it. keepalive lets it finish while the page
 * navigates away (Exit).
 */
export function finishLead(id: string) {
  return call<{ success?: boolean; sent?: boolean }>(`/api/portal/solar/leads/${encodeURIComponent(id)}/finish`, {
    method: 'POST',
    keepalive: true,
  });
}

// ---------------------------------------------------------------- leads

export type { SolarLeadBooking, SolarLeadView } from '@/lib/solar/leadView';
export type { SolarLeadStatus } from '@/lib/solar/leadFields';

/** Own leads (admins: every lead, unless `mine`), newest first, each with its live booking. */
export function fetchLeads({ mine = false }: { mine?: boolean } = {}) {
  return call<{ leads: SolarLeadView[] }>(`/api/portal/solar/leads${mine ? '?mine=1' : ''}`);
}

/** Admin only. Reopening ('new') comes back as 'booked' while a booking holds a slot. */
/** Admin only. 'lost' also cancels the lead's live booking (answered as cancelledBookingId). */
export function setLeadStatus(id: string, status: SolarLeadStatus) {
  return call<{ success: boolean; id: string; status: SolarLeadStatus; cancelledBookingId?: string }>(
    `/api/portal/solar/leads/${encodeURIComponent(id)}`,
    { method: 'PATCH', body: JSON.stringify({ status }) }
  );
}

/** Admin or the booking's consultant: frees the slot and puts the lead back to new. */
export function cancelBooking(id: string) {
  return call<{ success: boolean; id: string }>(`/api/portal/solar/bookings/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'cancelled' }),
  });
}

/** A short-lived signed link to one stored photo folder (the caller's own, or any for management). */
export async function photoUrl(path: string): Promise<string | null> {
  const res = await call<{ url: string | null }>(`/api/portal/forms/attachment?path=${encodeURIComponent(path)}`);
  if (!res.ok) throw new Error(res.error);
  return res.data.url;
}
