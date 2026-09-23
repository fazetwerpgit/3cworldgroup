import { getPlansByCompany } from '@/types';
import { weakerConfidence, type SaleScanFields, type ScanConfidence, type ScanValue } from './types';

// Turns what the model read off a confirmation into values the Log Sale form
// takes. The model only transcribes; every decision that matters (which
// catalog company, which plan, what counts as a date or a phone number) is
// made here, in code, so a bad read can only leave a field empty.

export type RawField = { value: string; confidence: ScanConfidence };

export type RawAddress = {
  street: string;
  unit?: string;
  city: string;
  state: string;
  zip: string;
  confidence: ScanConfidence;
};

/** What the model returns (see SCAN_RESPONSE_SCHEMA in extract.ts). */
export type RawExtraction = {
  orderNumber?: RawField;
  customerName?: RawField;
  customerPhone?: RawField;
  customerAddress?: RawAddress;
  carrier?: RawField;
  planText?: RawField;
  installDate?: RawField;
  installWindow?: RawField;
};

const squash = (value: string) => value.replace(/\s+/g, ' ').trim();

/** Brand wording on a confirmation → catalog company key. AT&T is tried first: "AT&T Fiber" also contains "T Fiber". */
const CARRIER_PATTERNS: Array<[RegExp, string]> = [
  [/\bat\s?&\s?t\b|\bat\s?and\s?t\b|\batt\b/i, 'att'],
  [/\bfrontier\b/i, 'frontier'],
  [/\bxfinity\b|\bcomcast\b/i, 'xfinity'],
  [/\bt[\s-]?mobile\b|\bt[\s-]?fiber\b|\btmo\b/i, 'tfiber'],
];

/** The catalog company a carrier name (or a plan name that carries one) belongs to. */
export function matchCarrier(text: string | undefined): string | null {
  if (!text) return null;
  for (const [pattern, company] of CARRIER_PATTERNS) if (pattern.test(text)) return company;
  return null;
}

/** "300 Mbps" → 300, "1 Gbps" → 1000 (the catalog's speed labels). */
function catalogMbps(speed: string): number | null {
  const match = /^(\d+(?:\.\d+)?)\s*(mbps|gbps)$/i.exec(speed.trim());
  if (!match) return null;
  const n = Number(match[1]);
  return match[2].toLowerCase() === 'gbps' ? Math.round(n * 1000) : n;
}

/**
 * The download speed a plan name states, in Mbps: "Fiber 1 Gig" → 1000,
 * "Internet 1000" → 1000, "2 GIG" → 2000, "Fiber 500" → 500, "Gigabit" → 1000.
 * Null when the name states no speed.
 */
export function planTextMbps(text: string): number | null {
  const t = text.toLowerCase().replace(/gigabits?/g, 'gig');
  const gig = /(\d+(?:\.\d+)?)\s*-?\s*(?:gig|gbps|gb|g)\b/.exec(t);
  if (gig) return Math.round(Number(gig[1]) * 1000);
  const mbps = /\b(\d{3,4})\s*(?:mbps|mb|megs?|m)?\b/.exec(t);
  if (mbps) return Number(mbps[1]);
  if (/\bgig\b/.test(t)) return 1000;
  return null;
}

/** The internet plan (never an extra) of `company` whose speed the plan name states. */
export function matchPlanId(company: string, planText: string | undefined): string | null {
  if (!planText) return null;
  const mbps = planTextMbps(planText);
  if (mbps === null) return null;
  const plans = getPlansByCompany(company).filter(
    (plan) => plan.category !== 'extra' && catalogMbps(plan.speed) === mbps
  );
  return plans.length === 1 ? plans[0].id : null;
}

/** US phone as "(512) 555-0142"; anything that is not 10 digits is dropped. */
export function formatPhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) digits = digits.slice(1);
  if (digits.length !== 10) return null;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

/** The form's one-line address: "123 Main St Apt 4, Austin, TX 78701". */
export function joinAddress(address: RawAddress): string | null {
  const street = squash(address.street ?? '');
  if (!street) return null;
  const unit = squash(address.unit ?? '');
  const city = squash(address.city ?? '');
  const state = squash(address.state ?? '').toUpperCase();
  const zip = squash(address.zip ?? '');
  const line1 = unit && !street.toLowerCase().includes(unit.toLowerCase()) ? `${street} ${unit}` : street;
  const stateZip = [state, zip].filter(Boolean).join(' ');
  return [line1, city, stateZip].filter(Boolean).join(', ');
}

/** A real YYYY-MM-DD calendar day, or null. */
export function cleanIsoDate(raw: string): string | null {
  const value = raw.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  const real = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return real && year >= 2020 && year <= 2100 ? value : null;
}

/** Order number / BTN as printed, less a leading "#" or label; must carry a digit. */
export function cleanOrderNumber(raw: string): string | null {
  const value = squash(raw)
    .replace(/^(order|confirmation|account|btn)\s*(number|no\.?|#)?\s*[:#]?\s*/i, '')
    .replace(/^#\s*/, '');
  return /\d/.test(value) && value.length <= 40 ? value : null;
}

function text(raw: string, max: number): string | null {
  const value = squash(raw);
  return value && value.length <= max ? value : null;
}

const keep = (value: string | null, confidence: ScanConfidence): ScanValue | undefined =>
  value ? { value, confidence } : undefined;

/** The model's read, reduced to form values; unreadable or unmatched fields are left out. */
export function toFormFields(raw: RawExtraction): SaleScanFields {
  const fields: SaleScanFields = {
    orderNumberOrBtn: raw.orderNumber && keep(cleanOrderNumber(raw.orderNumber.value), raw.orderNumber.confidence),
    customerName: raw.customerName && keep(text(raw.customerName.value, 80), raw.customerName.confidence),
    customerPhone: raw.customerPhone && keep(formatPhone(raw.customerPhone.value), raw.customerPhone.confidence),
    customerAddress: raw.customerAddress && keep(joinAddress(raw.customerAddress), raw.customerAddress.confidence),
    installDate: raw.installDate && keep(cleanIsoDate(raw.installDate.value), raw.installDate.confidence),
    installWindow: raw.installWindow && keep(text(raw.installWindow.value, 60), raw.installWindow.confidence),
  };

  // Carrier: its own line first, else a plan name that names it ("AT&T Internet 1000").
  const carrierHit = matchCarrier(raw.carrier?.value);
  const company = carrierHit ?? matchCarrier(raw.planText?.value);
  if (company) {
    const carrierConfidence = (carrierHit ? raw.carrier?.confidence : raw.planText?.confidence) ?? 'low';
    fields.provider = { value: company, confidence: carrierConfidence };
    const planId = matchPlanId(company, raw.planText?.value);
    if (planId && raw.planText) {
      fields.plan = { value: planId, confidence: weakerConfidence(carrierConfidence, raw.planText.confidence) };
    }
  }

  for (const key of Object.keys(fields) as Array<keyof SaleScanFields>) {
    if (!fields[key]) delete fields[key];
  }
  return fields;
}
