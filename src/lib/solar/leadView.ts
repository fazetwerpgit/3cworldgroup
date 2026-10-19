// The solar lead as the portal lists it (GET /api/portal/solar/leads): the
// stored lead with its live booking joined. Pure: the route builds it, the
// admin Leads tab and the rep Solar page read it.
import { SOLAR_HUB, hubTabHref } from '@/components/portal/admin-d/adminHubs';
import { CREDIT_TIERS, PHOTO_SLOTS, type CreditTier, type PhotoSlot, type SolarLeadStatus } from './leadFields';

export interface SolarLeadBooking {
  id: string;
  start: string;
  end: string | null;
  mode: 'virtual' | 'in_person';
  consultantUid: string;
  consultantName: string;
  /** The consultant's own time zone (their availability), for showing the time. */
  tz: string;
}

export interface SolarLeadView {
  id: string;
  status: SolarLeadStatus;
  first: string;
  last: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  email: string;
  monthlyBill: number | null;
  creditTier: CreditTier | null;
  photos: Partial<Record<PhotoSlot, string>>;
  source: 'portal' | 'knock';
  repUid: string;
  repName: string;
  createdAt: string | null;
  updatedAt: string | null;
  booking: SolarLeadBooking | null;
}

/** The admin Leads tab with this lead's sheet open: where every lead alert and booking notice links. */
export function solarLeadHref(leadId: string): string {
  return `${hubTabHref(SOLAR_HUB, 'leads')}&lead=${encodeURIComponent(leadId)}`;
}

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** ISO string from a Firestore Timestamp, a Date or an ISO string; null otherwise. */
export function isoOf(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return isoOf((value as { toDate: () => Date }).toDate());
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** A booking doc that still holds its slot, or null (missing or cancelled). */
export function bookingView(id: string, data: Record<string, unknown> | undefined, tz: string): SolarLeadBooking | null {
  if (!data || data.status === 'cancelled') return null;
  const start = isoOf(data.start);
  if (!start) return null;
  return {
    id,
    start,
    end: isoOf(data.end),
    mode: data.mode === 'virtual' ? 'virtual' : 'in_person',
    consultantUid: text(data.consultantUid),
    consultantName: text(data.consultantName) || 'Consultant',
    tz,
  };
}

/**
 * The stored lead as listed. Status reads 'booked' only while a booking holds a
 * slot; a lead whose booking is gone reads 'new' (unless it was closed).
 */
export function leadView(id: string, data: Record<string, unknown>, booking: SolarLeadBooking | null): SolarLeadView {
  const stored = data.status;
  const closed = stored === 'sold' || stored === 'lost';
  const status: SolarLeadStatus = closed ? stored : booking ? 'booked' : 'new';
  const photosIn = data.photos && typeof data.photos === 'object' ? (data.photos as Record<string, unknown>) : {};
  const photos: Partial<Record<PhotoSlot, string>> = {};
  for (const slot of PHOTO_SLOTS) {
    const path = text(photosIn[slot]);
    if (path) photos[slot] = path;
  }
  const creditTier = (CREDIT_TIERS as readonly unknown[]).includes(data.creditTier) ? (data.creditTier as CreditTier) : null;
  return {
    id,
    status,
    first: text(data.first),
    last: text(data.last),
    address: text(data.address),
    city: text(data.city),
    state: text(data.state),
    zip: text(data.zip),
    phone: text(data.phone),
    email: text(data.email),
    monthlyBill: typeof data.monthlyBill === 'number' && Number.isFinite(data.monthlyBill) ? data.monthlyBill : null,
    creditTier,
    photos,
    source: data.source === 'knock' ? 'knock' : 'portal',
    repUid: text(data.repUid),
    repName: text(data.repName),
    createdAt: isoOf(data.createdAt),
    updatedAt: isoOf(data.updatedAt),
    booking,
  };
}
