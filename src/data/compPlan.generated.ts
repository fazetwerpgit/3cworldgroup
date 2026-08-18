// GENERATED from "3C World Group 7.1 .26 Comp.xlsx" (2026-08-18) by
// scripts/gen-comp-plan — do not hand-edit rates; regenerate from the
// spreadsheet or edit via the owner comp-plan UI after seeding.
// Keys are FIBER_COMPANIES[].value / FIBER_PLANS[].id from src/types/sales.ts.
// Spreadsheet rows with no portal catalog entry (DirecTV, Brightspeed,
// Spectrum, AT&T 8 Gig/wireless, Frontier extras) are omitted until those
// products exist in FIBER_PLANS. Zero means "no contracted rate yet" —
// intentional, per Jacob.
//
// The numbers live in compPlan.generated.json so scripts/seed-comp-plan.mjs
// seeds Firestore from this exact file — one source of truth for app and seed.
import data from './compPlan.generated.json';
import type { CompPlanMargin, CompPlanRates } from '@/types/compPlan';

export const COMP_PLAN_VERSION: string = data.version;

export const COMP_PLAN_RATES: CompPlanRates = data.rates;

/** "3C Receives" — owner-only. Never ship to rep/admin payloads. */
export const COMP_PLAN_MARGIN: CompPlanMargin = data.margin;
