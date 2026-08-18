import type { FieldRole } from './auth';

// Comp plan: what a rep is paid per installed product, by field role. Separate
// from the legacy percentage-based `commission` config (config/commission),
// which stays untouched — this is the per-product dollar plan from the
// "3C World Group 7.1.26 Comp" sheet.

/** Field roles that carry a comp-plan rate table. Extract<> keeps every entry a real FieldRole. */
export type CompPlanRole = Extract<
  FieldRole,
  | 'ae_tier_1'
  | 'ae_tier_2'
  | 'gm_in_training'
  | 'general_manager'
  | 'office_manager'
  | 'regional_manager'
  | 'director'
  | 'internal_rep'
  | 'ibo_level_1'
  | 'ibo_level_2'
  | 'ibo_level_3'
  | 'ibo_level_4'
>;

export const COMP_PLAN_ROLES: readonly CompPlanRole[] = [
  'ae_tier_1',
  'ae_tier_2',
  'gm_in_training',
  'general_manager',
  'office_manager',
  'regional_manager',
  'director',
  'internal_rep',
  'ibo_level_1',
  'ibo_level_2',
  'ibo_level_3',
  'ibo_level_4',
];

/** FIBER_PLANS[].id → dollars paid on an install. Zero means "no contracted rate yet". */
export type CompPlanPlanRates = Record<string, number>;

/** FIBER_COMPANIES[].value → plan rates. */
export type CompPlanCompanyRates = Record<string, CompPlanPlanRates>;

/** The full plan: field role → company → plan → dollars. */
export type CompPlanRates = Record<CompPlanRole, CompPlanCompanyRates>;

/** "3C Receives" per company/plan. Owner-only — stored in its own Firestore doc. */
export type CompPlanMargin = CompPlanCompanyRates;

/**
 * Roles that predate the comp sheet read the AE Tier 1 rates until Jacob
 * reassigns those reps (his call — reps must not see an empty pay plan).
 */
export const LEGACY_ROLE_RATE_FALLBACK: Partial<Record<FieldRole, CompPlanRole>> = {
  entry_rep: 'ae_tier_1',
  entry_level_rep: 'ae_tier_1',
  l1_manager: 'ae_tier_1',
  l2_manager: 'ae_tier_1',
};

/** Reps are paid roughly two weeks after the install. */
export const PAY_DELAY_DAYS = 14;

export function isCompPlanRole(value: string | undefined | null): value is CompPlanRole {
  return !!value && (COMP_PLAN_ROLES as readonly string[]).includes(value);
}

/**
 * The rate table a field role is paid from: its own when the comp sheet has one,
 * otherwise the legacy fallback, otherwise null ("no pay plan assigned").
 */
export function resolveCompRole(fieldRole: FieldRole | string | undefined | null): CompPlanRole | null {
  if (!fieldRole) return null;
  if (isCompPlanRole(fieldRole)) return fieldRole;
  return LEGACY_ROLE_RATE_FALLBACK[fieldRole as FieldRole] ?? null;
}

/**
 * Dollars for one install. Any missing role, company or plan reads as 0 rather
 * than throwing: a stored plan can lag the product catalog, and an unknown
 * product must never inflate expected pay.
 */
export function rateFor(
  rates: Partial<CompPlanRates> | null | undefined,
  role: CompPlanRole | FieldRole | string | null | undefined,
  company: string | null | undefined,
  planId: string | null | undefined
): number {
  if (!rates || !role || !company || !planId) return 0;
  const value = rates[role as CompPlanRole]?.[company]?.[planId];
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** GET /api/portal/comp-plan. `margin` is present only for an owner. */
export interface CompPlanResponse {
  scope: 'own' | 'all';
  rates: CompPlanCompanyRates | Partial<CompPlanRates> | null;
  margin?: CompPlanMargin;
  fieldRole?: FieldRole | null;
  compRole?: CompPlanRole | null;
  payDelayDays: number;
  version: string;
  updatedAt: string | null;
  updatedByName: string | null;
}
