// A solar consultant's contact details for the homeowner's confirmation email:
// a Google Meet link (virtual consultations) and a phone number. Pure, so the
// Setup editor checks a field with the same rules the API enforces.
//
// Only real Google Meet links are accepted: the link is emailed to homeowners
// under 3C's name, so nothing else may be pasted in its place.

export type Normalized = { ok: true; value: string } | { ok: false; error: string };

export const MEET_LINK_ERROR = 'Paste a Google Meet link, like https://meet.google.com/abc-defg-hij';
export const PHONE_ERROR = 'Enter a 10-digit US number, or an international number that starts with +';

/** Meet's own code shape: abc-defg-hij (lowercase letters). */
const MEET_CODE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
const MAX_INPUT = 300;

/**
 * "https://meet.google.com/abc-defg-hij", or '' for a blank field. Accepts a
 * paste without the scheme (meet.google.com/...), http, any case, a trailing
 * slash, Meet's ?authuser= / ?pli= tails and a code typed without its dashes.
 * Anything else (another host, a port, credentials, another path) is refused.
 */
export function normalizeMeetLink(input: unknown): Normalized {
  if (input === null || input === undefined) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, error: MEET_LINK_ERROR };
  const raw = input.trim();
  if (!raw) return { ok: true, value: '' };
  if (raw.length > MAX_INPUT || /\s/.test(raw)) return { ok: false, error: MEET_LINK_ERROR };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, error: MEET_LINK_ERROR };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, error: MEET_LINK_ERROR };
  if (url.username || url.password || url.port) return { ok: false, error: MEET_LINK_ERROR };
  if (url.hostname.toLowerCase() !== 'meet.google.com') return { ok: false, error: MEET_LINK_ERROR };
  const path = url.pathname.replace(/\/+$/, '').replace(/^\//, '').toLowerCase();
  const code = /^[a-z]{10}$/.test(path) ? `${path.slice(0, 3)}-${path.slice(3, 7)}-${path.slice(7)}` : path;
  if (!MEET_CODE.test(code)) return { ok: false, error: MEET_LINK_ERROR };
  return { ok: true, value: `https://meet.google.com/${code}` };
}

/**
 * The stored form of a phone: "+15125550142" for a US number (10 digits, or 11
 * with a leading 1; area code and exchange never start with 0 or 1), "+<8-15
 * digits>" for an international number typed with its +, or '' for a blank
 * field. Spaces, dots, dashes and parentheses are ignored; letters and
 * extensions are refused.
 */
export function normalizeConsultantPhone(input: unknown): Normalized {
  if (input === null || input === undefined) return { ok: true, value: '' };
  if (typeof input !== 'string') return { ok: false, error: PHONE_ERROR };
  const raw = input.trim();
  if (!raw) return { ok: true, value: '' };
  if (raw.length > 40 || !/^\+?[\d\s().-]+$/.test(raw)) return { ok: false, error: PHONE_ERROR };
  const plus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (plus && !digits.startsWith('1')) {
    return digits.length >= 8 && digits.length <= 15 && digits[0] !== '0'
      ? { ok: true, value: `+${digits}` }
      : { ok: false, error: PHONE_ERROR };
  }
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10 || !/^[2-9]\d{2}[2-9]\d{6}$/.test(digits)) return { ok: false, error: PHONE_ERROR };
  return { ok: true, value: `+1${digits}` };
}

/** What a PUT body says about contact details. A key left out means "keep what is saved". */
export interface ContactPatch {
  meetLink?: string;
  phone?: string;
}

export type ParsedContact =
  | { ok: true; value: ContactPatch }
  | { ok: false; error: string; field: 'meetLink' | 'phone' };

/**
 * Reads meetLink and phone from a PUT body. A missing key is left out of the
 * patch (the saved value stays); '' or null clears it; anything else must
 * normalize.
 */
export function parseConsultantContact(input: unknown): ParsedContact {
  const body = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const value: ContactPatch = {};
  if ('meetLink' in body) {
    const meet = normalizeMeetLink(body.meetLink);
    if (!meet.ok) return { ok: false, error: meet.error, field: 'meetLink' };
    value.meetLink = meet.value;
  }
  if ('phone' in body) {
    const phone = normalizeConsultantPhone(body.phone);
    if (!phone.ok) return { ok: false, error: phone.error, field: 'phone' };
    value.phone = phone.value;
  }
  return { ok: true, value };
}

/** A stored value read back from Firestore: kept only when it still passes the rules. */
export function storedMeetLink(value: unknown): string {
  const meet = normalizeMeetLink(value);
  return meet.ok ? meet.value : '';
}

export function storedConsultantPhone(value: unknown): string {
  const phone = normalizeConsultantPhone(value);
  return phone.ok ? phone.value : '';
}

/** "Sam" from "Sam Closer"; the whole name when it has one word. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? '';
}
