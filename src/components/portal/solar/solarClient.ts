import { getIdToken } from '@/lib/firebase/getIdToken';
import { randomHex } from '@/lib/randomHex';

// Client half of the solar deck: the authed calls to /api/portal/solar/** and
// the pure formatting helpers the slides share (tested in solarClient.test.ts).

export const SOLAR_TZ = 'America/Los_Angeles';

export type SolarMode = 'virtual' | 'in_person';
export type CreditTier = 'purchase_600' | 'lease_ppa_680';
export type PhotoSlot = 'billPage1' | 'billGraph' | 'panel';

export type SolarSlot = { consultantUid: string; name: string; start: string; end: string };

export type SlotDay = { key: string; label: string; slots: SolarSlot[] };

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

const dayKeyFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: SOLAR_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const dayLabelFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: SOLAR_TZ,
  weekday: 'long',
  month: 'short',
  day: 'numeric',
});
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: SOLAR_TZ,
  hour: 'numeric',
  minute: '2-digit',
});

/** 2026-10-20 for the Pacific calendar day the instant falls on. */
export function pacificDayKey(iso: string): string {
  return dayKeyFmt.format(new Date(iso));
}

/** "9:00 AM" in Pacific time. */
export function formatSlotTime(iso: string): string {
  return timeFmt.format(new Date(iso));
}

/** "Tuesday, Oct 20 at 9:00 AM PT". */
export function formatSlotLong(iso: string): string {
  return `${dayLabelFmt.format(new Date(iso))} at ${formatSlotTime(iso)} PT`;
}

/** Slots grouped by Pacific day, days and times in order. */
export function groupSlotsByDay(slots: SolarSlot[]): SlotDay[] {
  const sorted = [...slots].sort(
    (a, b) => Date.parse(a.start) - Date.parse(b.start) || a.name.localeCompare(b.name)
  );
  const days: SlotDay[] = [];
  for (const slot of sorted) {
    const key = pacificDayKey(slot.start);
    let day = days[days.length - 1];
    if (!day || day.key !== key) {
      day = { key, label: dayLabelFmt.format(new Date(slot.start)), slots: [] };
      days.push(day);
    }
    day.slots.push(slot);
  }
  return days;
}

/** Names are worth showing only when more than one consultant has open time. */
export function hasSeveralConsultants(slots: SolarSlot[]): boolean {
  return new Set(slots.map((s) => s.consultantUid)).size > 1;
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

export function fetchAvailability(mode: SolarMode, from: Date, to: Date) {
  const q = new URLSearchParams({ mode, from: from.toISOString(), to: to.toISOString() });
  return call<{ slots: SolarSlot[] }>(`/api/portal/solar/availability?${q}`);
}

export function createBooking(payload: { leadId: string; mode: SolarMode; consultantUid: string; start: string }) {
  return call<{ id: string }>('/api/portal/solar/bookings', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
