// Solar consultant availability and open-slot math. Pure: no Firestore here
// (lib/solar/server.ts loads the docs), so the UI can import it too.
//
// solarAvailability/{consultantUid}: weekly windows per mode in wall-clock time
// of `tz`. Slots are `slotMin` long, start on the window's start and must end
// by the window's end. A booking blocks its consultant in every mode (one
// person can't be on a virtual call and at a door at the same time).

export const SOLAR_TZ = 'America/Los_Angeles';
export const SOLAR_SLOT_MIN = 60;
/** A slot must start at least this long after now (bookable and listed). */
export const SOLAR_MIN_LEAD_MIN = 120;
/** Jacob's virtual hours are set in Central Time. */
export const JACOB_TZ = 'America/Chicago';

export const SOLAR_MODES = ['virtual', 'in_person'] as const;
export type SolarMode = (typeof SOLAR_MODES)[number];

export function isSolarMode(value: unknown): value is SolarMode {
  return typeof value === 'string' && (SOLAR_MODES as readonly string[]).includes(value);
}

/** day: 0 = Sunday ... 6 = Saturday. start/end: "HH:MM" 24h wall time. */
export interface WeeklyWindow {
  day: number;
  start: string;
  end: string;
}

export interface SolarAvailability {
  consultantUid: string;
  name: string;
  tz: string;
  slotMin: number;
  modes: Partial<Record<SolarMode, WeeklyWindow[]>>;
}

/** A taken slot. `end` defaults to start + 60 min. Cancelled bookings never block. */
export interface SolarBookingLike {
  consultantUid: string;
  start: string;
  end?: string;
  status?: string;
}

export interface SolarSlot {
  consultantUid: string;
  name: string;
  /** UTC ISO (Date.toISOString()). */
  start: string;
  end: string;
}

const w = (day: number, start: string, end: string): WeeklyWindow => ({ day, start, end });

// Owner hours (docs/solar/PLAN.md). Mon=1 ... Sat=6.
export const OWNER_IN_PERSON: WeeklyWindow[] = [
  w(1, '08:00', '17:00'),
  w(2, '08:00', '20:00'),
  w(4, '08:00', '20:00'),
  w(5, '08:00', '20:00'),
];
export const OWNER_VIRTUAL: WeeklyWindow[] = [
  w(1, '08:00', '17:00'),
  w(2, '08:00', '20:00'),
  w(3, '08:00', '17:00'),
  w(4, '08:00', '20:00'),
  w(5, '08:00', '20:00'),
  w(6, '12:00', '20:00'),
];

// Jacob (Central Time): virtual only, Mon-Fri 10-5.
export const JACOB_VIRTUAL: WeeklyWindow[] = [1, 2, 3, 4, 5].map((d) => w(d, '10:00', '17:00'));

/** Seed used while solarAvailability is empty: owner in PT, Jacob in CT. */
export function seedAvailability(
  owner: { uid: string; name: string } | null,
  jacob: { uid: string; name: string } | null
): SolarAvailability[] {
  const out: SolarAvailability[] = [];
  if (owner) {
    out.push({
      consultantUid: owner.uid,
      name: owner.name,
      tz: SOLAR_TZ,
      slotMin: SOLAR_SLOT_MIN,
      modes: { virtual: OWNER_VIRTUAL.map((x) => ({ ...x })), in_person: OWNER_IN_PERSON.map((x) => ({ ...x })) },
    });
  }
  if (jacob && jacob.uid !== owner?.uid) {
    out.push({
      consultantUid: jacob.uid,
      name: jacob.name,
      tz: JACOB_TZ,
      slotMin: SOLAR_SLOT_MIN,
      modes: { virtual: JACOB_VIRTUAL.map((x) => ({ ...x })), in_person: [] },
    });
  }
  return out;
}

const MINUTE = 60_000;
const DAY = 86_400_000;

const partsFormatters = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsFormatters.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsFormatters.set(tz, f);
  }
  return f;
}

/** Wall-clock fields of an instant in `tz`. */
function wallParts(ms: number, tz: string) {
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(new Date(ms))) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { y: p.year, m: p.month, d: p.day, h: p.hour % 24, mi: p.minute, s: p.second };
}

/** tz offset (ms, local - UTC) at an instant. */
function offsetAt(ms: number, tz: string): number {
  const p = wallParts(ms, tz);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/**
 * The UTC instant of a wall time in `tz`, or null when that wall time does not
 * exist (inside a spring-forward gap).
 */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, tz: string): number | null {
  const guess = Date.UTC(y, m - 1, d, h, mi);
  let ms = guess - offsetAt(guess, tz);
  ms = guess - offsetAt(ms, tz);
  const back = wallParts(ms, tz);
  if (back.y !== y || back.m !== m || back.d !== d || back.h !== h || back.mi !== mi) return null;
  return ms;
}

function parseHm(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const h = Number(match[1]);
  const mi = Number(match[2]);
  if (h > 24 || mi > 59 || (h === 24 && mi !== 0)) return null;
  return h * 60 + mi;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Open slots for `mode` whose start is in [from, to) and at least
 * SOLAR_MIN_LEAD_MIN after `now`, sorted by start then consultant name. Each
 * consultant's windows are read in that consultant's own `tz`. A slot is gone when any non-cancelled booking of
 * that consultant overlaps it.
 */
export function openSlots(
  availability: SolarAvailability[],
  bookings: SolarBookingLike[],
  mode: SolarMode,
  from: Date,
  to: Date,
  now: Date
): SolarSlot[] {
  const fromMs = Math.max(from.getTime(), now.getTime() + SOLAR_MIN_LEAD_MIN * MINUTE);
  const toMs = to.getTime();
  if (!(toMs > fromMs)) return [];

  const taken = new Map<string, { start: number; end: number }[]>();
  for (const b of bookings) {
    if (b.status === 'cancelled') continue;
    const start = Date.parse(b.start);
    if (Number.isNaN(start)) continue;
    const endParsed = b.end ? Date.parse(b.end) : NaN;
    const end = Number.isNaN(endParsed) ? start + SOLAR_SLOT_MIN * MINUTE : endParsed;
    const list = taken.get(b.consultantUid) ?? [];
    list.push({ start, end });
    taken.set(b.consultantUid, list);
  }

  const slots: SolarSlot[] = [];
  for (const a of availability) {
    const windows = a.modes[mode] ?? [];
    if (windows.length === 0) continue;
    const tz = a.tz || SOLAR_TZ;
    const slotMin = a.slotMin > 0 ? a.slotMin : SOLAR_SLOT_MIN;
    const busy = taken.get(a.consultantUid) ?? [];

    // Walk local calendar days from the day before `from` to the day after `to`
    // (calendar math in UTC fields, so DST never skips or repeats a day).
    const first = wallParts(fromMs - DAY, tz);
    const last = wallParts(toMs + DAY, tz);
    const lastKey = Date.UTC(last.y, last.m - 1, last.d);
    for (let day = Date.UTC(first.y, first.m - 1, first.d); day <= lastKey; day += DAY) {
      const date = new Date(day);
      const y = date.getUTCFullYear();
      const m = date.getUTCMonth() + 1;
      const d = date.getUTCDate();
      const dow = date.getUTCDay();
      for (const win of windows) {
        if (win.day !== dow) continue;
        const startMin = parseHm(win.start);
        const endMin = parseHm(win.end);
        if (startMin === null || endMin === null) continue;
        for (let t = startMin; t + slotMin <= endMin; t += slotMin) {
          const startMs = zonedToUtc(y, m, d, Math.floor(t / 60), t % 60, tz);
          if (startMs === null) continue;
          const endMs = startMs + slotMin * MINUTE;
          if (startMs < fromMs || startMs >= toMs) continue;
          if (busy.some((b) => overlaps(startMs, endMs, b.start, b.end))) continue;
          slots.push({
            consultantUid: a.consultantUid,
            name: a.name,
            start: new Date(startMs).toISOString(),
            end: new Date(endMs).toISOString(),
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  return slots
    .filter((s) => {
      const key = `${s.consultantUid}_${s.start}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((x, y) => x.start.localeCompare(y.start) || x.name.localeCompare(y.name));
}

const pacificDayFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SOLAR_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/**
 * Reorders slots that share a start so the consultant to book comes first:
 * in person, the owner; virtual, whoever has the fewest bookings on that
 * Pacific day (ties go to the owner, then by name). Times stay in order. The
 * UI shows each start once and books the first free consultant, falling back
 * to the next on a 409.
 */
export function orderByPreference(
  slots: SolarSlot[],
  bookings: SolarBookingLike[],
  mode: SolarMode,
  ownerUid: string | null
): SolarSlot[] {
  const dayKey = (iso: string) => pacificDayFormatter.format(new Date(iso));
  const load = new Map<string, number>();
  for (const b of bookings) {
    if (b.status === 'cancelled' || Number.isNaN(Date.parse(b.start))) continue;
    const k = `${b.consultantUid}|${dayKey(b.start)}`;
    load.set(k, (load.get(k) ?? 0) + 1);
  }
  const owner = (s: SolarSlot) => (ownerUid && s.consultantUid === ownerUid ? 0 : 1);
  const count = (s: SolarSlot) => (mode === 'virtual' ? load.get(`${s.consultantUid}|${dayKey(s.start)}`) ?? 0 : 0);
  return [...slots].sort(
    (a, b) => a.start.localeCompare(b.start) || count(a) - count(b) || owner(a) - owner(b) || a.name.localeCompare(b.name)
  );
}

/** solarBookings doc id: one booking per consultant per slot start. */
export function bookingDocId(consultantUid: string, startISO: string): string {
  return `${consultantUid}_${startISO}`;
}

/** "Tuesday, October 20, 3:00 PM" in Pacific Time. */
export function formatSlotPT(startISO: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: SOLAR_TZ,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(startISO));
}

/** The time zones a consultant's hours can be set in (Admin > Solar > Setup). */
export const SOLAR_TIMEZONES = [
  { value: 'America/Los_Angeles', label: 'Pacific' },
  { value: 'America/Denver', label: 'Mountain' },
  { value: 'America/Chicago', label: 'Central' },
  { value: 'America/New_York', label: 'Eastern' },
] as const;

/** Slot lengths a consultant can offer, in minutes. */
export const SOLAR_SLOT_LENGTHS = [30, 60, 90] as const;

/** A consultant's editable hours: everything in SolarAvailability but who they are. */
export type SolarHours = Pick<SolarAvailability, 'tz' | 'slotMin'> & { modes: Record<SolarMode, WeeklyWindow[]> };

export type ParsedHours = { ok: true; value: SolarHours } | { ok: false; error: string };

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/**
 * Validates a PUT body's hours: {tz, slotMin, modes: {virtual?, in_person?}}.
 * tz is one of SOLAR_TIMEZONES, slotMin one of SOLAR_SLOT_LENGTHS, and each mode
 * has at most one window per day that fits at least one slot. Windows come back
 * sorted by day, with "H:MM" padded to "HH:MM". Missing modes are empty.
 */
export function parseAvailability(input: unknown): ParsedHours {
  if (!input || typeof input !== 'object') return { ok: false, error: 'Invalid hours' };
  const body = input as Record<string, unknown>;
  const tz = body.tz;
  if (typeof tz !== 'string' || !SOLAR_TIMEZONES.some((z) => z.value === tz)) {
    return { ok: false, error: 'Pick a time zone' };
  }
  const slotMin = body.slotMin;
  if (typeof slotMin !== 'number' || !(SOLAR_SLOT_LENGTHS as readonly number[]).includes(slotMin)) {
    return { ok: false, error: 'Slot length must be 30, 60 or 90 minutes' };
  }
  const rawModes = body.modes;
  if (rawModes !== undefined && (!rawModes || typeof rawModes !== 'object' || Array.isArray(rawModes))) {
    return { ok: false, error: 'Invalid hours' };
  }
  const modes = {} as Record<SolarMode, WeeklyWindow[]>;
  for (const mode of SOLAR_MODES) {
    const raw = (rawModes as Record<string, unknown> | undefined)?.[mode];
    if (raw === undefined) {
      modes[mode] = [];
      continue;
    }
    if (!Array.isArray(raw) || raw.length > 7) return { ok: false, error: 'Invalid hours' };
    const seen = new Set<number>();
    const windows: WeeklyWindow[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object') return { ok: false, error: 'Invalid hours' };
      const { day, start, end } = item as Record<string, unknown>;
      if (typeof day !== 'number' || !Number.isInteger(day) || day < 0 || day > 6) {
        return { ok: false, error: 'Invalid day' };
      }
      if (seen.has(day)) return { ok: false, error: `${DAY_NAMES[day]} is listed twice` };
      seen.add(day);
      const startMin = typeof start === 'string' ? parseHm(start) : null;
      const endMin = typeof end === 'string' ? parseHm(end) : null;
      if (startMin === null || endMin === null) return { ok: false, error: `${DAY_NAMES[day]} has an invalid time` };
      if (endMin - startMin < slotMin) {
        return { ok: false, error: `${DAY_NAMES[day]} ends before one ${slotMin}-minute slot fits` };
      }
      const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
      windows.push({ day, start: hm(startMin), end: hm(endMin) });
    }
    modes[mode] = windows.sort((a, b) => a.day - b.day);
  }
  return { ok: true, value: { tz, slotMin, modes } };
}
