// How a solar lead reads on screen (admin Leads tab, rep Solar page). Pure.
import type { Tone } from '@/components/portal/admin-d/AdminUi';
import type { SolarLeadBooking, SolarLeadStatus, SolarLeadView } from './solarClient';

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
  purchase_600: 'Purchase, 600+',
  lease_ppa_680: 'Lease or PPA, 680+',
};

export const PHOTO_LABELS: { slot: 'billPage1' | 'billGraph' | 'panel'; label: string }[] = [
  { slot: 'billPage1', label: 'Bill, first page' },
  { slot: 'billGraph', label: 'Bill, usage graph' },
  { slot: 'panel', label: 'Electric panel' },
];

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

/** "$212/mo", or '' when no bill was entered. */
export function billLine(monthlyBill: number | null): string {
  return monthlyBill == null ? '' : `${money.format(monthlyBill)}/mo`;
}

const MODE: Record<SolarLeadBooking['mode'], string> = { virtual: 'Virtual', in_person: 'In person' };

export function modeLabel(mode: SolarLeadBooking['mode']): string {
  return MODE[mode];
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
