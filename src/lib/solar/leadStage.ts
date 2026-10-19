// When a solar lead was DEMOED and when it CLOSED, read defensively from
// whatever the lead holds, for the solar board's Demoed and Closed counts.
//
// TEMPORARY ADAPTER (solar batch D): the lead sales stages (`stage`,
// `stageHistory`, the demo outcome) land with batch C. Until then this file
// names the stage values itself. When C merges, swap the constants below for
// C's exported ones (and its outcome field name if it differs from
// `outcome` / `stageOutcome`); leadMilestones() is the only reader.
//
// Rules:
//  - Demoed: the lead is at appointment_demoed (any outcome) or any later
//    stage. Dated by the first stageHistory entry at demoed-or-later.
//  - Closed: the demo outcome is sale, or the lead is past the demo (a later
//    stage implies the sale). Dated by the first history entry that shows it.
//  - A lead with a stage but no dated history falls back to updatedAt.
//  - Old data (no `stage`): status 'sold' is demoed + sale, 'lost' is demoed +
//    no_sale, dated by statusChangedAt, else updatedAt.
//  - Counted only while the lead still stands there: a sale walked back to
//    no_sale leaves Closed.

import { toDate } from '@/lib/solar/leaderboard';

type Data = Record<string, unknown>;

/** TODO(batch C merge): replace with C's exported stage constants. */
export const DEMOED_STAGE = 'appointment_demoed';
/** TODO(batch C merge): the stages after the demo, from C's constants. */
export const POST_DEMO_STAGES = ['site_survey', 'permit_approved', 'install_scheduled', 'install_complete', 'pto'] as const;
/** Every stage at or past the demo: the Firestore `in` filter the board reads with. */
export const DEMOED_OR_LATER_STAGES = [DEMOED_STAGE, ...POST_DEMO_STAGES] as const;
/** Old closed statuses (before stages). */
export const LEGACY_CLOSED_STATUSES = ['sold', 'lost'] as const;

export type DemoOutcome = 'sale' | 'no_sale' | 'proposal_sent';

export interface LeadMilestones {
  /** When the lead first reached the demo, or null when it is not (now) demoed. */
  demoedAt: Date | null;
  /** The demo's outcome as the lead stands now (sale when it is past the demo). */
  outcome: DemoOutcome | null;
  /** When the sale first showed, or null when the lead is not (now) a sale. */
  closedAt: Date | null;
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isPostDemo = (stage: string) => (POST_DEMO_STAGES as readonly string[]).includes(stage);
const isDemoedOrLater = (stage: string) => stage === DEMOED_STAGE || isPostDemo(stage);

function outcomeOf(value: unknown): DemoOutcome | null {
  return value === 'sale' || value === 'no_sale' || value === 'proposal_sent' ? value : null;
}

function earliest(dates: (Date | null)[]): Date | null {
  let min: Date | null = null;
  for (const date of dates) if (date && (!min || date < min)) min = date;
  return min;
}

export function leadMilestones(data: Data): LeadMilestones {
  const none: LeadMilestones = { demoedAt: null, outcome: null, closedAt: null };
  const stage = text(data.stage);

  if (!stage) {
    // Before stages: sold / lost only.
    const status = data.status;
    if (status !== 'sold' && status !== 'lost') return none;
    const at = toDate(data.statusChangedAt) ?? toDate(data.updatedAt);
    if (!at) return none;
    return status === 'sold'
      ? { demoedAt: at, outcome: 'sale', closedAt: at }
      : { demoedAt: at, outcome: 'no_sale', closedAt: null };
  }
  if (!isDemoedOrLater(stage)) return none;

  const history = (Array.isArray(data.stageHistory) ? data.stageHistory : [])
    .filter((entry): entry is Data => !!entry && typeof entry === 'object')
    .map((entry) => ({ stage: text(entry.stage), outcome: outcomeOf(entry.outcome), at: toDate(entry.at) }));

  // The outcome as it stands: the lead's own field, else the newest demo entry's.
  const lastDemoOutcome = [...history].reverse().find((entry) => entry.stage === DEMOED_STAGE && entry.outcome)?.outcome ?? null;
  const outcome: DemoOutcome | null = isPostDemo(stage)
    ? 'sale'
    : outcomeOf(data.outcome) ?? outcomeOf(data.stageOutcome) ?? lastDemoOutcome;

  const fallback = toDate(data.updatedAt);
  const demoedAt = earliest(history.filter((entry) => isDemoedOrLater(entry.stage)).map((entry) => entry.at)) ?? fallback;
  if (!demoedAt) return none;

  let closedAt: Date | null = null;
  if (outcome === 'sale') {
    closedAt =
      earliest(
        history
          .filter((entry) => isPostDemo(entry.stage) || (entry.stage === DEMOED_STAGE && entry.outcome === 'sale'))
          .map((entry) => entry.at)
      ) ?? fallback ?? demoedAt;
  }
  return { demoedAt, outcome, closedAt };
}
