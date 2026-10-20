// When a solar lead was DEMOED and when it CLOSED, for the solar board's
// Demoed and Closed counts. The stage values and rules come from leadStage
// (readStage / isDemoedStage / isClosedStage); this file only dates them.
//
// Rules:
//  - Demoed: the lead has any sales-dept stage (appointment_demoed, any
//    outcome, or later). Dated by the first stageHistory entry with a stage.
//  - Closed: isClosedStage (demo outcome sale, or any later stage). Dated by
//    the first history entry that shows the sale.
//  - A lead with a stage but no dated history falls back to stageChangedAt,
//    then updatedAt.
//  - Old data (no stored `stage`): status 'sold' is demoed + sale, 'lost' is
//    demoed + no_sale, dated by statusChangedAt, else updatedAt.
//  - Counted only while the lead still stands there: a sale walked back to
//    no_sale leaves Closed.

import { toDate } from '@/lib/solar/leaderboard';
import {
  isClosedStage,
  isDemoedStage,
  isSolarDemoOutcome,
  isSolarLeadStage,
  readStage,
  type SolarDemoOutcome,
} from '@/lib/solar/leadStage';

type Data = Record<string, unknown>;

/** Old closed statuses (before stages): the second Firestore read the board makes. */
export const LEGACY_CLOSED_STATUSES = ['sold', 'lost'] as const;

export interface LeadMilestones {
  /** When the lead first reached the demo, or null when it is not (now) demoed. */
  demoedAt: Date | null;
  /** The demo's outcome as the lead stands now (sale when it is past the demo). */
  outcome: SolarDemoOutcome | null;
  /** When the sale first showed, or null when the lead is not (now) a sale. */
  closedAt: Date | null;
}

const NONE: LeadMilestones = { demoedAt: null, outcome: null, closedAt: null };

function earliest(dates: (Date | null)[]): Date | null {
  let min: Date | null = null;
  for (const date of dates) if (date && (!min || date < min)) min = date;
  return min;
}

export function leadMilestones(data: Data): LeadMilestones {
  if (!isSolarLeadStage(data.stage)) {
    // Before stages: readStage maps sold / lost; date them by the status change.
    const { stage, outcome } = readStage(data);
    if (!isDemoedStage(stage)) return NONE;
    const at = toDate(data.statusChangedAt) ?? toDate(data.updatedAt);
    if (!at) return NONE;
    return { demoedAt: at, outcome, closedAt: isClosedStage(stage, outcome) ? at : null };
  }

  const read = readStage(data);
  const stage = read.stage;
  const history = (Array.isArray(data.stageHistory) ? data.stageHistory : [])
    .filter((entry): entry is Data => !!entry && typeof entry === 'object')
    .map((entry) => ({
      stage: isSolarLeadStage(entry.stage) ? entry.stage : null,
      outcome: isSolarDemoOutcome(entry.outcome) ? entry.outcome : null,
      at: toDate(entry.at),
    }));

  // The outcome as it stands: the lead's stageOutcome, else the newest demo entry's.
  const lastDemoOutcome =
    [...history].reverse().find((entry) => entry.stage === 'appointment_demoed' && entry.outcome)?.outcome ?? null;
  const outcome: SolarDemoOutcome | null =
    stage === 'appointment_demoed' ? read.outcome ?? lastDemoOutcome : 'sale';

  const fallback = toDate(data.stageChangedAt) ?? toDate(data.updatedAt);
  const demoedAt = earliest(history.filter((entry) => isDemoedStage(entry.stage)).map((entry) => entry.at)) ?? fallback;
  if (!demoedAt) return NONE;

  let closedAt: Date | null = null;
  if (isClosedStage(stage, outcome)) {
    closedAt =
      earliest(history.filter((entry) => isClosedStage(entry.stage, entry.outcome)).map((entry) => entry.at)) ??
      fallback ??
      demoedAt;
  }
  return { demoedAt, outcome, closedAt };
}
