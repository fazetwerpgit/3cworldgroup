import { z } from 'zod';
import { addDays, chicagoDayKey, chicagoHour, isDayKey, type DayKey } from '@/lib/weeklyInstalls/week';

// Owner push announcements: the shared rules for what an announcement may say
// and when it goes out. Safe to import on the client (no Admin SDK).
//
// This Vercel project is on the Hobby plan, where a cron may run at most once a
// day. vercel.json runs /api/cron/announcements daily at 13:00 AND 14:00 UTC
// (the weekly-installs pattern: 8 AM Chicago is one or the other depending on
// DST), so the owner picks a DAY and the push goes out at about 8 AM Central.
// sendAt is stored as that day's real 8:00 AM Chicago instant, and the cron
// sends whatever is due, so the run that lands before 8 AM local does nothing.

export const ANNOUNCEMENT_TITLE_MAX = 50;
export const ANNOUNCEMENT_BODY_MAX = 180;
export const ANNOUNCEMENT_SEND_HOUR = 8;
/** How far ahead a send may be booked. */
export const ANNOUNCEMENT_MAX_DAYS_AHEAD = 90;
/** Where tapping the notification lands. */
export const ANNOUNCEMENT_URL = '/portal';

export type AnnouncementStatus = 'scheduled' | 'sending' | 'sent' | 'failed' | 'cancelled';

export interface AnnouncementView {
  id: string;
  title: string;
  body: string;
  sendAt: string | null;
  status: AnnouncementStatus;
  createdBy: string;
  createdAt: string | null;
  sentAt: string | null;
  sentCount: number;
  failedCount: number;
}

export const announcementMessageSchema = z.object({
  title: z.string().trim().min(1, 'Add a title').max(ANNOUNCEMENT_TITLE_MAX, `Title is over ${ANNOUNCEMENT_TITLE_MAX} characters`),
  body: z.string().trim().min(1, 'Add a message').max(ANNOUNCEMENT_BODY_MAX, `Message is over ${ANNOUNCEMENT_BODY_MAX} characters`),
});

export const announcementCreateSchema = announcementMessageSchema.extend({
  sendDate: z.string().refine(isDayKey, 'Pick a send date'),
});

/** The 8:00 AM Chicago instant on `day` (13:00 UTC in CDT, 14:00 UTC in CST). */
export function sendAtForDay(day: DayKey): Date {
  const [year, month, date] = day.split('-').map(Number);
  const summer = new Date(Date.UTC(year, month - 1, date, ANNOUNCEMENT_SEND_HOUR + 5));
  return chicagoHour(summer) === ANNOUNCEMENT_SEND_HOUR
    ? summer
    : new Date(Date.UTC(year, month - 1, date, ANNOUNCEMENT_SEND_HOUR + 6));
}

/** The first day whose 8 AM send is still ahead of `now`. */
export function nextSendDay(now: Date): DayKey {
  const today = chicagoDayKey(now);
  return sendAtForDay(today).getTime() > now.getTime() ? today : addDays(today, 1);
}

/** Why `day` can't be booked at `now`, or null when it can. */
export function sendDayError(day: DayKey, now: Date): string | null {
  const first = nextSendDay(now);
  if (day < first) return "That morning's send has already gone. Pick a later day.";
  if (day > addDays(first, ANNOUNCEMENT_MAX_DAYS_AHEAD)) {
    return `Pick a day within ${ANNOUNCEMENT_MAX_DAYS_AHEAD} days.`;
  }
  return null;
}
