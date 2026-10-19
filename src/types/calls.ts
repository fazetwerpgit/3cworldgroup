// Recurring team calls. Video is NOT hosted in the app - each call links
// out to Google Meet. Ops/admin manage the schedule; everyone views it.

export type CallDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday';

export const CALL_DAY_ORDER: CallDay[] = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

export const CallDayLabels: Record<CallDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

// Who the call is for. 'all' shows to everyone; 'managers' only to
// l1/l2 managers (and platform users, who see everything).
export type CallAudience = 'all' | 'managers';

export const CallAudienceLabels: Record<CallAudience, string> = {
  all: 'Everyone',
  managers: 'Managers only',
};

// Upper bound on one scheduledCalls read. The schedule is a handful of
// recurring weekly calls that ops add and delete by hand, so this never trims a
// real schedule; it only keeps a per-request read (dashboard, Ask) bounded.
export const MAX_SCHEDULED_CALLS = 100;

// Firestore: scheduledCalls collection
export interface ScheduledCall {
  id: string;
  title: string;
  description?: string;
  day: CallDay;
  time: string; // "HH:mm" 24h, local to the team
  timezone: string; // e.g. "America/Chicago"
  meetLink: string; // Google Meet URL
  audience: CallAudience;
  active: boolean;
  createdBy: string;
  createdByName?: string;
  createdAt?: Date;
  updatedAt?: Date;
}
