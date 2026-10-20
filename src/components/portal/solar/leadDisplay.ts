// How a solar lead reads on screen (admin Leads tab, rep Solar page). Pure.
import type { Tone } from '@/components/portal/admin-d/AdminUi';
import type { SolarLeadBooking, SolarLeadStatus, SolarLeadView } from './solarClient';
import { NO_SALE_REASON_LABELS, ROOF_TYPE_LABELS, type RoofType } from '@/lib/solar/leadFields';
import { OUTCOME_LABEL, STAGE_LABEL, stageText, type SolarDemoOutcome, type SolarLeadStage } from '@/lib/solar/leadStage';

export const STATUS_LABEL: Record<SolarLeadStatus, string> = {
  new: 'New',
  booked: 'Booked',
  sold: 'Sold',
  lost: 'Lost',
};

/** Amber waits on someone, blue is set, lime is won, muted is closed. */
export const STATUS_TONE: Record<SolarLeadStatus, Tone> = {
  new: 'amber',
  booked: 'blue',
  sold: 'lime',
  lost: 'muted',
};

export const CREDIT_LABEL: Record<string, string> = {
  purchase_600: 'Purchase, 600–679',
  lease_ppa_680: 'Lease, PPA or Purchase, 680+',
};

/** "No sale: low credit" for a lead closed at pre-qualification, else null. */
export function noSaleLine(lead: Pick<SolarLeadView, 'noSaleReason'>): string | null {
  return lead.noSaleReason ? NO_SALE_REASON_LABELS[lead.noSaleReason] : null;
}

/** The credit answer: its tier, "No sale: low credit" (Under 600), or `none`. */
export function creditLine(lead: Pick<SolarLeadView, 'creditTier' | 'noSaleReason'>, none: string): string {
  return noSaleLine(lead) ?? (lead.creditTier ? CREDIT_LABEL[lead.creditTier] : none);
}

export const PHOTO_LABELS: { slot: 'billPage1' | 'billGraph' | 'panel' | 'meter'; label: string }[] = [
  { slot: 'billPage1', label: 'Bill, first page' },
  { slot: 'billGraph', label: 'Bill, usage page' },
  { slot: 'panel', label: 'Electric panel' },
  { slot: 'meter', label: 'Electric meter' },
];

/** The sales-dept stage as a status line, or null before one is set. */
export function stageLine(
  lead: { stage: SolarLeadStage | null; stageOutcome: SolarDemoOutcome | null }
): { text: string; short: string; tone: Tone } | null {
  if (!lead.stage) return null;
  const tone: Tone =
    lead.stage !== 'appointment_demoed'
      ? 'lime'
      : lead.stageOutcome === 'sale'
        ? 'lime'
        : lead.stageOutcome === 'no_sale'
          ? 'muted'
          : 'blue';
  const short =
    lead.stage === 'appointment_demoed' && lead.stageOutcome ? OUTCOME_LABEL[lead.stageOutcome] : STAGE_LABEL[lead.stage];
  return { text: stageText(lead.stage, lead.stageOutcome), short, tone };
}

export function roofLabel(roofType: RoofType | null): string {
  return roofType ? ROOF_TYPE_LABELS[roofType] : '';
}

const kwh = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });

/** "1,250 kWh/mo", or '' when none was entered. */
export function kwhLine(monthlyKwh: number | null): string {
  return monthlyKwh == null ? '' : `${kwh.format(monthlyKwh)} kWh/mo`;
}

export function leadName(lead: Pick<SolarLeadView, 'first' | 'last'>): string {
  return `${lead.first} ${lead.last}`.trim() || 'Homeowner';
}

export function leadPlace(lead: Pick<SolarLeadView, 'city' | 'state'>): string {
  return [lead.city, lead.state].filter(Boolean).join(', ');
}

export function leadAddress(lead: Pick<SolarLeadView, 'address' | 'city' | 'state' | 'zip'>): string {
  const cityLine = [lead.city, [lead.state, lead.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
  return [lead.address, cityLine].filter(Boolean).join(', ');
}

const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const cents = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/** "$212/mo" or "$212.50/mo" (the deck takes cents), or '' when no bill was entered. */
export function billLine(monthlyBill: number | null): string {
  if (monthlyBill == null) return '';
  return `${(Number.isInteger(monthlyBill) ? money : cents).format(monthlyBill)}/mo`;
}

const MODE: Record<SolarLeadBooking['mode'], string> = { virtual: 'Virtual', in_person: 'In person' };

export function modeLabel(mode: SolarLeadBooking['mode']): string {
  return MODE[mode];
}

/**
 * The same moment as consultTime, in pieces for a date figure: month "Oct",
 * day "27", weekday "Tuesday", time "10:00 AM CDT". Null when the zone or the
 * date cannot be read (callers fall back to consultTime).
 */
export function consultParts(
  booking: Pick<SolarLeadBooking, 'start' | 'tz'>
): { month: string; day: string; weekday: string; time: string } | null {
  try {
    const parts: Record<string, string> = {};
    for (const part of new Intl.DateTimeFormat('en-US', {
      timeZone: booking.tz,
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).formatToParts(new Date(booking.start))) {
      parts[part.type] = part.value;
    }
    if (!parts.day || !parts.month || !parts.hour) return null;
    return {
      month: parts.month,
      day: parts.day,
      weekday: parts.weekday ?? '',
      time: `${parts.hour}:${parts.minute} ${parts.dayPeriod ?? ''} ${parts.timeZoneName ?? ''}`.replace(/\s+/g, ' ').trim(),
    };
  } catch {
    return null;
  }
}

/** "Tue, Oct 27, 10:00 AM CDT" in the consultant's own zone. */
export function consultTime(booking: Pick<SolarLeadBooking, 'start' | 'tz'>): string {
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: booking.tz,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZoneName: 'short',
    }).format(new Date(booking.start));
  } catch {
    return new Date(booking.start).toLocaleString('en-US');
  }
}

/** "Oct 19, 2026" for when the lead was saved. */
export function savedDate(iso: string | null): string {
  if (!iso) return '';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(iso));
}

/** The soonest booking not yet over, across these leads (closed leads skipped). */
export function nextConsult(leads: SolarLeadView[], now = Date.now()): SolarLeadView | null {
  let best: SolarLeadView | null = null;
  for (const lead of leads) {
    if (!lead.booking || lead.status === 'sold' || lead.status === 'lost') continue;
    const at = Date.parse(lead.booking.start);
    const end = lead.booking.end ? Date.parse(lead.booking.end) : at + 60 * 60_000;
    if (Number.isNaN(at) || end <= now) continue;
    if (!best || at < Date.parse(best.booking!.start)) best = lead;
  }
  return best;
}
