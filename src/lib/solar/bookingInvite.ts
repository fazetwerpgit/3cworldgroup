// The "Add to calendar" .ics files for a solar booking: one for the homeowner
// (on the confirmation email) and one for the consultant (on the booking
// notice). Both carry the same UID, so they describe the same booking.
import { buildIcs, icsAttachment } from '@/lib/email/ics';
import { displayPhone } from '@/lib/phone';
import { firstName } from '@/lib/solar/consultantContact';

export interface BookingInviteInput {
  bookingId: string;
  mode: 'virtual' | 'in_person';
  /** UTC ISO instants. */
  start: string;
  end: string;
  consultantName: string;
  /** The booking's snapshot of the consultant's details; '' when not set. */
  meetLink: string;
  consultantPhone: string;
  customerName: string;
  customerPhone: string;
  /** The homeowner's address; '' when the lead has none. */
  address: string;
  /** Full URL of the lead in the portal (consultant copy only). */
  leadUrl: string;
  stamp?: Date;
}

export const bookingIcsUid = (bookingId: string) => `${bookingId}@3cworldgroup.com`;

/** Where the consultation happens: the Meet link (virtual) or the home (in person). */
function locationOf(b: BookingInviteInput): string {
  return b.mode === 'virtual' ? b.meetLink : b.address;
}

function base(b: BookingInviteInput) {
  const meet = b.mode === 'virtual' ? b.meetLink : '';
  return {
    uid: bookingIcsUid(b.bookingId),
    start: new Date(b.start),
    end: new Date(b.end),
    location: locationOf(b) || undefined,
    url: meet || undefined,
    stamp: b.stamp,
  };
}

/** The homeowner's copy: "Solar consultation with {consultant}". */
export function customerBookingIcs(b: BookingInviteInput): string {
  const how = b.mode === 'virtual' ? 'Virtual' : 'In-person';
  const meet = b.mode === 'virtual' ? b.meetLink : '';
  const who = firstName(b.consultantName) || 'your consultant';
  const lines = [
    `${how} solar consultation with ${b.consultantName}, booked by 3C World Group.`,
    meet ? `Join on Google Meet: ${meet}` : '',
    b.mode === 'in_person' && b.address ? `Where: ${b.address}` : '',
    b.consultantPhone ? `Questions before then? Call or text ${who} at ${displayPhone(b.consultantPhone)}.` : '',
    'To change the time, reply to your confirmation email.',
  ].filter(Boolean);
  return buildIcs({ ...base(b), summary: `Solar consultation with ${b.consultantName}`, description: lines.join('\n') });
}

/** The consultant's copy: "Solar consult: {homeowner}", with how to reach them and the lead. */
export function consultantBookingIcs(b: BookingInviteInput): string {
  const how = b.mode === 'virtual' ? 'Virtual' : 'In-person';
  const meet = b.mode === 'virtual' ? b.meetLink : '';
  const homeowner = b.customerName || 'Homeowner';
  const lines = [
    `${how} solar consult with ${homeowner}.`,
    b.customerPhone ? `Phone: ${displayPhone(b.customerPhone)}` : '',
    b.address ? `Address: ${b.address}` : '',
    meet ? `Google Meet: ${meet}` : '',
    b.leadUrl ? `Lead: ${b.leadUrl}` : '',
  ].filter(Boolean);
  return buildIcs({ ...base(b), summary: `Solar consult: ${homeowner}`, description: lines.join('\n') });
}

/** What a cancel file needs: the booking's id (its UID), time and names. */
export interface BookingCancelInput {
  bookingId: string;
  /** UTC ISO instants. */
  start: string;
  end: string;
  consultantName: string;
  customerName: string;
  stamp?: Date;
}

/**
 * The invites went out at SEQUENCE:0 (they are never re-sent), so the cancel
 * is SEQUENCE:1: same UID, METHOD:CANCEL, and the reader's calendar drops it.
 */
export const BOOKING_CANCEL_SEQUENCE = 1;

function cancelIcs(b: BookingCancelInput, summary: string): string {
  return buildIcs({
    uid: bookingIcsUid(b.bookingId),
    start: new Date(b.start),
    end: new Date(b.end),
    summary,
    stamp: b.stamp,
    method: 'CANCEL',
    sequence: BOOKING_CANCEL_SEQUENCE,
  });
}

/** Takes the homeowner's copy (customerBookingIcs) off their calendar. */
export const customerBookingCancelIcs = (b: BookingCancelInput) =>
  cancelIcs(b, `Solar consultation with ${b.consultantName}`);

/** Takes the consultant's copy (consultantBookingIcs) off their calendar. */
export const consultantBookingCancelIcs = (b: BookingCancelInput) =>
  cancelIcs(b, `Solar consult: ${b.customerName || 'Homeowner'}`);

export const customerBookingCancelAttachment = (b: BookingCancelInput) =>
  icsAttachment('solar-consultation-cancelled.ics', customerBookingCancelIcs(b), 'CANCEL');

export const consultantBookingCancelAttachment = (b: BookingCancelInput) =>
  icsAttachment('solar-consult-cancelled.ics', consultantBookingCancelIcs(b), 'CANCEL');

export const customerBookingAttachment = (b: BookingInviteInput) =>
  icsAttachment('solar-consultation.ics', customerBookingIcs(b));

export const consultantBookingAttachment = (b: BookingInviteInput) =>
  icsAttachment('solar-consult.ics', consultantBookingIcs(b));
