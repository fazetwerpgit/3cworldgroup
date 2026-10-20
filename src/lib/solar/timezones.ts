// Solar booking time zones. Pure (Intl only), so the deck, the admin Setup and
// the API routes share it.
//
// - A consultant's hours are entered and stored in the consultant's own zone
//   (solarAvailability/{uid}.tz). A doc with no tz reads as Pacific: the
//   pre-zone code read every consultant's hours in America/Los_Angeles.
// - The deck shows bookable times in the CUSTOMER's zone: the lead's state
//   (zoneForState), else the rep's device zone.
// - A booking stores the UTC instant (start/startAt) plus customerTz and
//   consultantTz. Bookings made before these fields existed read in Pacific,
//   as the old notices and deck showed them (bookingZones).

/**
 * The zone the pre-zone code assumed for everything: consultant hours with no
 * tz, and how booked times were shown. Stored data with no zone keeps reading
 * in it, so nothing already saved moves when zones ship.
 */
export const LEGACY_TZ = 'America/Los_Angeles';

/** The zone a consultant newly added in Admin > Solar > Setup starts on. */
export const DEFAULT_CONSULTANT_TZ = 'America/Chicago';

/** Bookable times reach at most this many calendar days out (Jeremy). */
export const SOLAR_MAX_DAYS_OUT = 14;

/** UTC ms of 00:00 on a calendar date in `tz` (US zones change clocks at 2 AM, so midnight exists). */
function midnightIn(y: number, m: number, d: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d);
  const offset = (ms: number) => {
    const p: Record<string, number> = {};
    for (const part of fmt(tz, 'parts', {
      hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric',
    }).formatToParts(new Date(ms))) {
      if (part.type !== 'literal') p[part.type] = Number(part.value);
    }
    return Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
  };
  let ms = guess - offset(guess);
  ms = guess - offset(ms);
  return ms;
}

/**
 * The booking window's end: the end of the 14th calendar day after today in
 * the customer's zone `tz` (today is day 0). A slot must start before it.
 */
export function bookingWindowEnd(now: Date, tz: string): Date {
  const [y, m, d] = dayKeyIn(now.toISOString(), tz).split('-').map(Number);
  return new Date(midnightIn(y, m, d + SOLAR_MAX_DAYS_OUT + 1, tz));
}

/** Whether a slot starting at `start` is inside the booking window for a customer in `tz`. */
export function withinBookingWindow(start: Date, now: Date, tz: string): boolean {
  return start.getTime() < bookingWindowEnd(now, tz).getTime();
}

/** US zones a consultant can work in, and the deck's zone switcher offers. */
export const US_TIMEZONES = [
  { value: 'America/New_York', label: 'Eastern', abbr: 'ET' },
  { value: 'America/Chicago', label: 'Central', abbr: 'CT' },
  { value: 'America/Denver', label: 'Mountain', abbr: 'MT' },
  { value: 'America/Phoenix', label: 'Arizona', abbr: 'MST' },
  { value: 'America/Los_Angeles', label: 'Pacific', abbr: 'PT' },
  { value: 'America/Anchorage', label: 'Alaska', abbr: 'AKT' },
  { value: 'Pacific/Honolulu', label: 'Hawaii', abbr: 'HST' },
] as const;

export function isUsTimeZone(tz: unknown): tz is string {
  return typeof tz === 'string' && US_TIMEZONES.some((z) => z.value === tz);
}

/**
 * Each state's (and DC's / territories') main zone. States split across zones
 * use the zone most of their people live in (FL, TN, KY, IN, MI -> their
 * eastern part; TX, KS, NE, ND, SD -> Central; ID -> Mountain; OR -> Pacific).
 */
export const US_STATE_TZ: Record<string, string> = {
  AL: 'America/Chicago',
  AK: 'America/Anchorage',
  AZ: 'America/Phoenix',
  AR: 'America/Chicago',
  CA: 'America/Los_Angeles',
  CO: 'America/Denver',
  CT: 'America/New_York',
  DE: 'America/New_York',
  DC: 'America/New_York',
  FL: 'America/New_York',
  GA: 'America/New_York',
  HI: 'Pacific/Honolulu',
  ID: 'America/Denver',
  IL: 'America/Chicago',
  IN: 'America/New_York',
  IA: 'America/Chicago',
  KS: 'America/Chicago',
  KY: 'America/New_York',
  LA: 'America/Chicago',
  ME: 'America/New_York',
  MD: 'America/New_York',
  MA: 'America/New_York',
  MI: 'America/New_York',
  MN: 'America/Chicago',
  MS: 'America/Chicago',
  MO: 'America/Chicago',
  MT: 'America/Denver',
  NE: 'America/Chicago',
  NV: 'America/Los_Angeles',
  NH: 'America/New_York',
  NJ: 'America/New_York',
  NM: 'America/Denver',
  NY: 'America/New_York',
  NC: 'America/New_York',
  ND: 'America/Chicago',
  OH: 'America/New_York',
  OK: 'America/Chicago',
  OR: 'America/Los_Angeles',
  PA: 'America/New_York',
  RI: 'America/New_York',
  SC: 'America/New_York',
  SD: 'America/Chicago',
  TN: 'America/Chicago',
  TX: 'America/Chicago',
  UT: 'America/Denver',
  VT: 'America/New_York',
  VA: 'America/New_York',
  WA: 'America/Los_Angeles',
  WV: 'America/New_York',
  WI: 'America/Chicago',
  WY: 'America/Denver',
  PR: 'America/Puerto_Rico',
  VI: 'America/St_Thomas',
  GU: 'Pacific/Guam',
  AS: 'Pacific/Pago_Pago',
  MP: 'Pacific/Saipan',
};

/** The zone for a two-letter state ("fl", " FL "), or null when unknown. */
export function zoneForState(state: unknown): string | null {
  if (typeof state !== 'string') return null;
  return US_STATE_TZ[state.trim().toUpperCase()] ?? null;
}

/** Whether Intl knows this IANA zone. */
export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The device's zone (the rep's phone), or null when Intl can't say. */
export function deviceTimeZone(): string | null {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : null;
  } catch {
    return null;
  }
}

/** The customer's zone: the lead's state, else the device zone, else Central. */
export function customerZone(state: unknown, device: string | null = deviceTimeZone()): string {
  return zoneForState(state) ?? device ?? DEFAULT_CONSULTANT_TZ;
}

const formatters = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string, key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const id = `${tz}|${key}`;
  let f = formatters.get(id);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, ...options });
    formatters.set(id, f);
  }
  return f;
}

/**
 * The short label shown next to times: "ET", "CT", "MT", "PT" for the main US
 * zones (DST-neutral, how people say it), else Intl's short name ("EDT",
 * "GMT+1").
 */
export function zoneAbbr(tz: string, at: Date | string = new Date()): string {
  const known = US_TIMEZONES.find((z) => z.value === tz);
  if (known) return known.abbr;
  try {
    const part = fmt(tz, 'abbr', { timeZoneName: 'short' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName');
    return part?.value ?? tz;
  } catch {
    return tz;
  }
}

/** "Eastern Time (ET)", or the zone id for one outside the US list. */
export function zoneName(tz: string): string {
  const known = US_TIMEZONES.find((z) => z.value === tz);
  return known ? `${known.label} Time (${known.abbr})` : `${tz.replace(/_/g, ' ')} (${zoneAbbr(tz)})`;
}

/** 2026-10-20: the calendar day the instant falls on in `tz`. */
export function dayKeyIn(iso: string, tz: string): string {
  const p: Record<string, string> = {};
  for (const part of fmt(tz, 'day', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(iso))) {
    p[part.type] = part.value;
  }
  return `${p.year}-${p.month}-${p.day}`;
}

/** "Tuesday, Oct 20" in `tz`. */
export function dayLabelIn(iso: string, tz: string): string {
  return fmt(tz, 'dayLabel', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(iso));
}

/** "9:00 AM" in `tz`. */
export function timeIn(iso: string, tz: string): string {
  return fmt(tz, 'time', { hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
}

/** "Tuesday, October 20, 3:00 PM ET": notices and emails. */
export function formatWhen(iso: string, tz: string): string {
  const when = fmt(tz, 'when', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(
    new Date(iso)
  );
  return `${when} ${zoneAbbr(tz, iso)}`;
}

/**
 * The time for a consultant's notice: their own zone, plus the customer's when
 * it differs. "Tuesday, October 20, 12:00 PM PT (3:00 PM ET for the customer)".
 */
export function formatWhenForConsultant(iso: string, consultantTz: string, customerTz: string | null): string {
  const own = formatWhen(iso, consultantTz);
  if (!customerTz || zoneAbbr(customerTz, iso) === zoneAbbr(consultantTz, iso)) return own;
  return `${own} (${timeIn(iso, customerTz)} ${zoneAbbr(customerTz, iso)} for the customer)`;
}

/**
 * The zones a stored booking reads in. consultantTz / customerTz when stored;
 * an older booking has neither, so both read in `fallbackConsultantTz`
 * (Pacific, as the old code showed every booking, unless the caller knows better).
 */
export function bookingZones(
  data: Record<string, unknown> | undefined,
  fallbackConsultantTz: string = LEGACY_TZ
): { consultantTz: string; customerTz: string } {
  const consultantTz = isValidTimeZone(data?.consultantTz) ? data.consultantTz : fallbackConsultantTz;
  const customerTz = isValidTimeZone(data?.customerTz) ? data.customerTz : consultantTz;
  return { consultantTz, customerTz };
}
