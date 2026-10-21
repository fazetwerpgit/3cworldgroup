// Solar records made by a QA test account (users/{uid}.testAccount === true;
// lib/users/demoAccount). Its solarLeads and solarBookings carry
// `testAccount: true`. A stamped record stays out of every cross-user view (the
// solar board, the admin leads list) and reaches nobody real: no owner lead
// alert, no homeowner email, no Google Calendar event, and the consultant's
// notice only when the consultant is a test account too. The test account still
// sees its own records.
import { adminDb } from '@/lib/firebase/admin';
import { isTestAccount } from '@/lib/users/demoAccount';

type Data = Record<string, unknown> | null | undefined;

/**
 * Whether a solarLeads / solarBookings doc belongs in a view built for
 * `viewerUid`: every unstamped record, and a stamped one only for the test
 * account that owns it (repUid).
 */
export function solarRecordVisibleTo(data: Data, viewerUid?: string | null): boolean {
  if (!isTestAccount(data)) return true;
  return !!viewerUid && data?.repUid === viewerUid;
}

/** Who a booking's messages may reach (announceBooking, announceBookingCancel). */
export interface BookingAudience {
  /** The homeowner's confirmation / cancel email. */
  homeowner: boolean;
  /** The consultant's Google Calendar event (Google invites the homeowner). */
  google: boolean;
  /**
   * The consultant notice: 'normal' follows consultantNotice (the owner rule),
   * 'consultant' goes to the consultant only (a test consultant on a test
   * booking), 'none' sends nothing.
   */
  consultant: 'normal' | 'consultant' | 'none';
}

export function bookingAudience(testRecord: boolean, consultantIsTest: boolean): BookingAudience {
  if (!testRecord) return { homeowner: true, google: true, consultant: 'normal' };
  return { homeowner: false, google: false, consultant: consultantIsTest ? 'consultant' : 'none' };
}

/** Whether users/{uid} is a test account. False when the doc is missing or the read fails. */
export async function isTestAccountUid(uid: string): Promise<boolean> {
  if (!adminDb || !uid) return false;
  try {
    return isTestAccount((await adminDb.collection('users').doc(uid).get()).data());
  } catch (error) {
    console.error('test account lookup failed:', error);
    return false;
  }
}
