// The usage helper's math: what a rep reads off the electric bill (monthly
// kWh, a daily average, or the twelve monthly bars) turned into the annual and
// average monthly kWh a proposal needs, plus the plain-text block a rep pastes
// into Aurora. Pure (tested in usage.test.ts).
import { leadAddress } from './leadDisplay';

export type UsageMode = 'monthly' | 'daily' | 'months';

/**
 * What the rep entered, kept with the deck (deckState `usage`). The stored
 * lead field is deckState `monthlyKwh`, the average this works out to.
 */
export type UsageEntry = {
  mode: UsageMode;
  /** Monthly kWh as typed in the monthly mode. */
  monthly: number | null;
  /** Daily average kWh as typed in the daily mode. */
  daily: number | null;
  /** Twelve monthly kWh values (null where blank), Jan through Dec. */
  months: (number | null)[];
};

export type UsageEstimate = {
  annualKwh: number;
  monthlyKwh: number;
  /** How many of the twelve months were entered (the months mode only). */
  monthsEntered: number;
};

export const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Highest kWh one field takes (a month, or a day). */
export const KWH_INPUT_MAX = 99_999;

export const EMPTY_USAGE: UsageEntry = {
  mode: 'monthly',
  monthly: null,
  daily: null,
  months: Array<number | null>(12).fill(null),
};

/** Days in an average year, so a daily average becomes an annual figure. */
const DAYS_PER_YEAR = 365;

/**
 * Cleans what is being typed: digits and one decimal point with at most one
 * place ("1,250 kWh" -> "1250", "32.45" -> "32.4"). Kept as text so "32."
 * survives mid-typing.
 */
export function cleanKwhDraft(text: string): string {
  const kept = text.replace(/[^\d.]/g, '');
  const dot = kept.indexOf('.');
  const whole = (dot === -1 ? kept : kept.slice(0, dot)).replace(/^0+(?=\d)/, '').slice(0, 5);
  if (dot === -1) return whole;
  const tenths = kept.slice(dot + 1).replace(/\./g, '').slice(0, 1);
  return `${whole || '0'}.${tenths}`;
}

/** The kWh a draft stands for, or null when blank or zero; capped at KWH_INPUT_MAX. */
export function parseKwh(text: string): number | null {
  const n = Number(cleanKwhDraft(text));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(KWH_INPUT_MAX, Math.round(n * 10) / 10);
}

const kwhFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 });

/** "1,250", "32.4". */
export function formatKwh(value: number): string {
  return kwhFmt.format(Number.isFinite(value) ? value : 0);
}

/** The same value as plain editable text: "1250", "32.4". */
export function editableKwh(value: number | null): string {
  return value === null || !Number.isFinite(value) || value <= 0 ? '' : String(value);
}

/** A stored entry read back defensively (sessionStorage may hold an older or partial shape). */
export function normalizeUsage(raw: unknown): UsageEntry {
  if (!raw || typeof raw !== 'object') return { ...EMPTY_USAGE, months: [...EMPTY_USAGE.months] };
  const r = raw as Partial<Record<keyof UsageEntry, unknown>>;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.min(KWH_INPUT_MAX, v) : null);
  const mode: UsageMode = r.mode === 'daily' || r.mode === 'months' ? r.mode : 'monthly';
  const months = Array.from({ length: 12 }, (_, i) => (Array.isArray(r.months) ? num(r.months[i]) : null));
  return { mode, monthly: num(r.monthly), daily: num(r.daily), months };
}

/**
 * Annual and average monthly kWh for what was entered in the chosen mode, or
 * null when that mode has nothing yet. Monthly: x12. Daily: x365, then /12.
 * Months: the sum when all twelve are in; with fewer, the entered months'
 * average stands in for the missing ones. Whole kWh.
 */
export function estimateUsage(entry: UsageEntry): UsageEstimate | null {
  if (entry.mode === 'monthly') {
    if (!entry.monthly) return null;
    return { annualKwh: Math.round(entry.monthly * 12), monthlyKwh: Math.round(entry.monthly), monthsEntered: 0 };
  }
  if (entry.mode === 'daily') {
    if (!entry.daily) return null;
    const annual = entry.daily * DAYS_PER_YEAR;
    return { annualKwh: Math.round(annual), monthlyKwh: Math.round(annual / 12), monthsEntered: 0 };
  }
  const filled = entry.months.filter((v): v is number => typeof v === 'number' && v > 0);
  if (filled.length === 0) return null;
  const average = filled.reduce((sum, v) => sum + v, 0) / filled.length;
  return { annualKwh: Math.round(average * 12), monthlyKwh: Math.round(average), monthsEntered: filled.length };
}

/** One line of how the estimate was reached, for the slide and the Aurora block. */
export function usageBasis(entry: UsageEntry, estimate: UsageEstimate): string {
  if (entry.mode === 'monthly') return 'Monthly kWh from the bill x 12';
  if (entry.mode === 'daily') return `Daily average ${formatKwh(entry.daily ?? 0)} kWh x 365`;
  if (estimate.monthsEntered === 12) return 'Sum of 12 monthly values';
  return `Average of ${estimate.monthsEntered} of 12 months x 12`;
}

type AuroraLead = { first: string; last: string; address: string; city: string; state: string; zip: string };

/** "123 Main St, Fresno, CA 93701", skipping blank parts. */
export function formatAddress(lead: Pick<AuroraLead, 'address' | 'city' | 'state' | 'zip'>): string {
  return leadAddress({
    address: lead.address.trim(),
    city: lead.city.trim(),
    state: lead.state.trim().toUpperCase(),
    zip: lead.zip.trim(),
  });
}

/**
 * The block "Copy for Aurora" puts on the clipboard: who, where, the annual
 * and monthly figures, and the monthly values when the rep entered them.
 */
export function auroraText(lead: AuroraLead, entry: UsageEntry, estimate: UsageEstimate): string {
  const name = [lead.first.trim(), lead.last.trim()].filter(Boolean).join(' ');
  const lines = [
    `Customer: ${name || '-'}`,
    `Address: ${formatAddress(lead) || '-'}`,
    `Annual usage: ${formatKwh(estimate.annualKwh)} kWh (est.)`,
    `Monthly average: ${formatKwh(estimate.monthlyKwh)} kWh`,
    `Based on: ${usageBasis(entry, estimate)}`,
  ];
  if (entry.mode === 'months') {
    const values = entry.months
      .map((v, i) => (v ? `${MONTH_LABELS[i]} ${formatKwh(v)}` : null))
      .filter((v): v is string => v !== null);
    if (values.length > 0) lines.push(`Monthly kWh: ${values.join(', ')}`);
  }
  return lines.join('\n');
}
