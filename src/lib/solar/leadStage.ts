// Sales-department stages of a solar lead (Jeremy's "Solar dispos", 10/19):
// what the consultant / closer records after the appointment. Owned by the
// portal; reps only read them. Pure: the stage route, the lead view, the admin
// Leads tab, the rep Solar page and the leaderboard all share it.
//
// Stored on solarLeads/{id}:
//   stage:        SolarLeadStage | absent (no sales-dept stage yet)
//   stageOutcome: SolarDemoOutcome | absent (only with stage 'appointment_demoed')
//   stageHistory: SolarStageEntry[] (oldest first, capped at STAGE_HISTORY_MAX)
// Old leads have none of these; a closed one reads its stage from status
// (sold -> appointment_demoed + sale, lost -> appointment_demoed + no_sale).

/** In order. Every stage after 'appointment_demoed' implies the sale. */
export const SOLAR_LEAD_STAGES = [
  'appointment_demoed',
  'site_survey',
  'permit_approved',
  'install_scheduled',
  'install_complete',
  'pto',
] as const;
export type SolarLeadStage = (typeof SOLAR_LEAD_STAGES)[number];

/** The outcome of 'appointment_demoed' (required with it, refused with any other stage). */
export const SOLAR_DEMO_OUTCOMES = ['sale', 'no_sale', 'proposal_sent'] as const;
export type SolarDemoOutcome = (typeof SOLAR_DEMO_OUTCOMES)[number];

export const STAGE_LABEL: Record<SolarLeadStage, string> = {
  appointment_demoed: 'Appointment demoed',
  site_survey: 'Site survey',
  permit_approved: 'Permit approved',
  install_scheduled: 'Install scheduled',
  install_complete: 'Install complete',
  pto: 'PTO',
};

export const OUTCOME_LABEL: Record<SolarDemoOutcome, string> = {
  sale: 'Sale',
  no_sale: 'No sale',
  proposal_sent: 'Proposal sent',
};

/** One stage change. stage null = an admin cleared the stage (or reopened the lead). */
export interface SolarStageEntry {
  stage: SolarLeadStage | null;
  outcome?: SolarDemoOutcome;
  /** ISO time of the change. */
  at: string;
  byUid: string;
}

export const STAGE_HISTORY_MAX = 100;

export function isSolarLeadStage(value: unknown): value is SolarLeadStage {
  return typeof value === 'string' && (SOLAR_LEAD_STAGES as readonly string[]).includes(value);
}

export function isSolarDemoOutcome(value: unknown): value is SolarDemoOutcome {
  return typeof value === 'string' && (SOLAR_DEMO_OUTCOMES as readonly string[]).includes(value);
}

/** -1 for no stage, then 0..5 in SOLAR_LEAD_STAGES order (the outcome doesn't move the rank). */
export function stageRank(stage: SolarLeadStage | null): number {
  return stage ? SOLAR_LEAD_STAGES.indexOf(stage) : -1;
}

/**
 * Counted as "Demoed": any sales-dept stage at all (every later stage comes
 * after the demo). For the leaderboard.
 */
export function isDemoedStage(stage: SolarLeadStage | null): boolean {
  return stage !== null;
}

/**
 * Counted as "Closed" (a sale): appointment_demoed with outcome 'sale', or any
 * later stage. For the leaderboard.
 */
export function isClosedStage(stage: SolarLeadStage | null, outcome: SolarDemoOutcome | null): boolean {
  if (!stage) return false;
  return stage === 'appointment_demoed' ? outcome === 'sale' : true;
}

/** "Appointment demoed: Proposal sent", "Site survey", or '' for no stage. */
export function stageText(stage: SolarLeadStage | null, outcome: SolarDemoOutcome | null): string {
  if (!stage) return '';
  const label = STAGE_LABEL[stage];
  return stage === 'appointment_demoed' && outcome ? `${label}: ${OUTCOME_LABEL[outcome]}` : label;
}

/**
 * The lead's stage as stored, or read from its old sold/lost status when it
 * has none. Unknown values read as no stage.
 */
export function readStage(data: Record<string, unknown>): { stage: SolarLeadStage | null; outcome: SolarDemoOutcome | null } {
  if (isSolarLeadStage(data.stage)) {
    const outcome = data.stage === 'appointment_demoed' && isSolarDemoOutcome(data.stageOutcome) ? data.stageOutcome : null;
    return { stage: data.stage, outcome };
  }
  if (data.status === 'sold') return { stage: 'appointment_demoed', outcome: 'sale' };
  if (data.status === 'lost') return { stage: 'appointment_demoed', outcome: 'no_sale' };
  return { stage: null, outcome: null };
}

function isoOrNull(value: unknown): string | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof value.toDate === 'function') {
    return isoOrNull((value as { toDate: () => Date }).toDate());
  }
  if (typeof value === 'string' && !Number.isNaN(Date.parse(value))) return new Date(value).toISOString();
  return null;
}

/** The stored history, cleaned (bad entries dropped); [] when there is none. */
export function readStageHistory(value: unknown): SolarStageEntry[] {
  if (!Array.isArray(value)) return [];
  const out: SolarStageEntry[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') continue;
    const e = raw as Record<string, unknown>;
    const stage = e.stage === null ? null : isSolarLeadStage(e.stage) ? e.stage : undefined;
    const at = isoOrNull(e.at);
    if (stage === undefined || !at) continue;
    const entry: SolarStageEntry = { stage, at, byUid: typeof e.byUid === 'string' ? e.byUid : '' };
    if (stage === 'appointment_demoed' && isSolarDemoOutcome(e.outcome)) entry.outcome = e.outcome;
    out.push(entry);
  }
  return out;
}

/**
 * The lead status a stage implies: a sale (or any later stage) is 'sold', no
 * sale is 'lost', and no stage or proposal sent leaves the lead open (null:
 * the caller picks 'booked' or 'new' from its booking).
 */
export function statusForStage(stage: SolarLeadStage | null, outcome: SolarDemoOutcome | null): 'sold' | 'lost' | null {
  if (isClosedStage(stage, outcome)) return 'sold';
  if (stage === 'appointment_demoed' && outcome === 'no_sale') return 'lost';
  return null;
}

export type StageRequest = { stage: SolarLeadStage | null; outcome: SolarDemoOutcome | null };

/** Body of PATCH /api/portal/solar/leads/{id}/stage: {stage, outcome?}. */
export function parseStageRequest(body: unknown): { ok: true; value: StageRequest } | { ok: false; error: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !('stage' in body)) {
    return { ok: false, error: 'stage is required' };
  }
  const { stage, outcome } = body as { stage: unknown; outcome?: unknown };
  if (stage !== null && !isSolarLeadStage(stage)) return { ok: false, error: 'Invalid stage' };
  const hasOutcome = outcome !== undefined && outcome !== null && outcome !== '';
  if (stage === 'appointment_demoed') {
    if (!isSolarDemoOutcome(outcome)) return { ok: false, error: 'appointment_demoed needs an outcome: sale, no_sale or proposal_sent' };
    return { ok: true, value: { stage, outcome } };
  }
  if (hasOutcome) return { ok: false, error: 'outcome only goes with appointment_demoed' };
  return { ok: true, value: { stage, outcome: null } };
}

/** Demo outcomes from worst to best: a non-admin may only move up this list. */
export const OUTCOME_RANK: Record<SolarDemoOutcome, number> = { no_sale: 0, proposal_sent: 1, sale: 2 };

/**
 * Whether a non-admin may make this move: a later stage, or on
 * appointment_demoed a better outcome (no_sale < proposal_sent < sale; the
 * same one is a no-op). Moving back, clearing the stage, a worse outcome, or
 * any outcome change on a sold lead (`status` 'sold', old status-only leads
 * too) is admins' only.
 */
export function isForwardMove(from: StageRequest, to: StageRequest, status?: unknown): boolean {
  if (to.stage === null) return false;
  const fromRank = stageRank(from.stage);
  const toRank = stageRank(to.stage);
  if (toRank !== fromRank) return toRank > fromRank;
  if (to.stage !== 'appointment_demoed' || from.outcome === null) return true;
  if (to.outcome === from.outcome) return true;
  if (status === 'sold' || from.outcome === 'sale') return false;
  return to.outcome !== null && OUTCOME_RANK[to.outcome] > OUTCOME_RANK[from.outcome];
}

/**
 * Solar roles on the sales side that may set a stage (besides admins/owners
 * and the consultants set in Admin > Solar > Setup). Canvassers, the canvass
 * manager and marketing only read it.
 */
export const SOLAR_STAGE_ROLES = ['canvass_closer', 'in_person_closer', 'virtual_closer', 'sales_director'] as const;

/**
 * The stage fields an old-style status change (admin Mark sold / Mark lost /
 * Reopen) writes, so stage and status never disagree: sold sets
 * appointment_demoed + sale (a later stage is kept), lost sets
 * appointment_demoed + no_sale, and reopening clears a closing stage
 * (proposal sent stays). {} when the stage already fits.
 */
export function stagePatchForStatus(
  data: Record<string, unknown>,
  status: 'new' | 'booked' | 'sold' | 'lost',
  byUid: string,
  now: Date
): Record<string, unknown> {
  const current = readStage(data);
  let next: StageRequest | null = null;
  if (status === 'sold') {
    if (!isClosedStage(current.stage, current.outcome)) next = { stage: 'appointment_demoed', outcome: 'sale' };
  } else if (status === 'lost') {
    if (!(current.stage === 'appointment_demoed' && current.outcome === 'no_sale')) {
      next = { stage: 'appointment_demoed', outcome: 'no_sale' };
    }
  } else if (statusForStage(current.stage, current.outcome) !== null) {
    next = { stage: null, outcome: null };
  }
  // An old sold/lost lead has no stored stage; writing the one it reads as keeps it explicit.
  const stored = isSolarLeadStage(data.stage);
  if (!next) return stored || !current.stage ? {} : { stage: current.stage, stageOutcome: current.outcome };
  const entry: SolarStageEntry = {
    stage: next.stage,
    ...(next.outcome ? { outcome: next.outcome } : {}),
    at: now.toISOString(),
    byUid,
  };
  return {
    stage: next.stage,
    stageOutcome: next.outcome,
    stageHistory: [...readStageHistory(data.stageHistory), entry].slice(-STAGE_HISTORY_MAX),
    stageChangedAt: now,
    stageChangedBy: byUid,
  };
}
