// The solar board's three counts (Set | Demoed | Closed) and their words.
// Each is a LeaderboardMetric, sent as ?metric= to GET /api/portal/solar/leaderboard
// (which reads bookedConsults as set, solarDemoed as demoed, solarClosed as
// closed). The count rides in totalSales and totalPoints, as booked consults did.

export type SolarMetric = 'bookedConsults' | 'solarDemoed' | 'solarClosed';

export function isSolarMetric(metric: string): metric is SolarMetric {
  return metric === 'bookedConsults' || metric === 'solarDemoed' || metric === 'solarClosed';
}

export interface SolarCopy {
  /** The tab label: Set, Demoed, Closed. */
  label: string;
  /** After a number: "3 set", "3 demoed", "3 closed". */
  unit: string;
  /** In a sentence: "1 consult passes ...". */
  one: string;
  many: string;
  /** The score column. */
  head: string;
  /** Lowercase adjective + things, for "Weekly booked consults". */
  adj: string;
  things: string;
  /** Screen-reader name of the mix line under a rep. */
  mixLabel: string;
  recentTitle: string;
  /** The empty past month: title and line ("Nothing was booked in May 2026."). */
  emptyTitle: string;
  emptyPast: string;
  emptyOpen: string;
  /** Desktop stat label for the leader. */
  topLabel: string;
  /** Desktop footer. */
  footer: string;
}

export const SOLAR_COPY: Record<SolarMetric, SolarCopy> = {
  bookedConsults: {
    label: 'Set',
    unit: 'set',
    one: 'consult',
    many: 'consults',
    head: 'Booked',
    adj: 'booked',
    things: 'consults',
    mixLabel: 'Consults by type',
    recentTitle: 'Recent consults',
    emptyTitle: 'No booked consults',
    emptyPast: 'Nothing was booked',
    emptyOpen: 'Booked consults will appear here.',
    topLabel: 'Most booked',
    footer: 'Rankings count consults booked in the selected period; cancelled ones drop off.',
  },
  solarDemoed: {
    label: 'Demoed',
    unit: 'demoed',
    one: 'demo',
    many: 'demos',
    head: 'Demoed',
    adj: 'demoed',
    things: 'appointments',
    mixLabel: 'Demos by outcome',
    recentTitle: 'Recent demos',
    emptyTitle: 'No demoed appointments',
    emptyPast: 'Nothing was demoed',
    emptyOpen: 'Demoed appointments will appear here.',
    topLabel: 'Most demoed',
    footer: 'Rankings count appointments demoed in the selected period, any outcome.',
  },
  solarClosed: {
    label: 'Closed',
    unit: 'closed',
    one: 'sale',
    many: 'sales',
    head: 'Closed',
    adj: 'closed',
    things: 'sales',
    mixLabel: 'Closed sales',
    recentTitle: 'Recent closes',
    emptyTitle: 'No closed sales',
    emptyPast: 'Nothing was closed',
    emptyOpen: 'Closed sales will appear here.',
    topLabel: 'Most closed',
    footer: 'Rankings count demos closed as a sale in the selected period.',
  },
};

/** Set | Demoed | Closed, in switch order. Set (booked consults) is the default. */
export const SOLAR_METRIC_OPTIONS: { value: SolarMetric; label: string }[] = (
  ['bookedConsults', 'solarDemoed', 'solarClosed'] as const
).map((value) => ({ value, label: SOLAR_COPY[value].label }));
