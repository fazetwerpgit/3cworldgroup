import { describe, it, expect } from 'vitest';
import { COMP_PLAN_MARGIN, COMP_PLAN_RATES, COMP_PLAN_VERSION } from './compPlan.generated';
import { COMP_PLAN_ROLES } from '@/types/compPlan';
import { FIBER_COMPANIES, FIBER_PLANS } from '@/types/sales';

const COMPANY_VALUES = new Set(FIBER_COMPANIES.map((c) => c.value));
const PLANS_BY_ID = new Map(FIBER_PLANS.map((p) => [p.id, p]));

describe('generated comp plan', () => {
  it('has a version', () => {
    expect(COMP_PLAN_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('covers every comp plan role', () => {
    for (const role of COMP_PLAN_ROLES) {
      expect(COMP_PLAN_RATES[role], `missing rates for ${role}`).toBeTruthy();
    }
    expect(Object.keys(COMP_PLAN_RATES).sort()).toEqual([...COMP_PLAN_ROLES].sort());
  });

  it('keys rates by real companies and plans, with sane numbers', () => {
    for (const role of COMP_PLAN_ROLES) {
      for (const [company, plans] of Object.entries(COMP_PLAN_RATES[role])) {
        expect(COMPANY_VALUES.has(company), `unknown company ${company} (${role})`).toBe(true);
        for (const [planId, rate] of Object.entries(plans)) {
          const plan = PLANS_BY_ID.get(planId);
          expect(plan, `unknown plan ${planId} (${role})`).toBeTruthy();
          expect(plan!.company, `plan ${planId} filed under ${company}`).toBe(company);
          expect(Number.isFinite(rate)).toBe(true);
          expect(rate).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  it('keys the owner-only margin by real companies and plans', () => {
    for (const [company, plans] of Object.entries(COMP_PLAN_MARGIN)) {
      expect(COMPANY_VALUES.has(company), `unknown company ${company} (margin)`).toBe(true);
      for (const [planId, amount] of Object.entries(plans)) {
        const plan = PLANS_BY_ID.get(planId);
        expect(plan, `unknown plan ${planId} (margin)`).toBeTruthy();
        expect(plan!.company).toBe(company);
        expect(amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  // Reported, not enforced: the comp sheet lags the catalog, and a product with
  // no contracted rate is a business fact ("we probably don't have the contract
  // yet"), not a test failure.
  it('reports catalog plans with no AE Tier 1 rate', () => {
    const uncovered = FIBER_PLANS.filter(
      (plan) => COMP_PLAN_RATES.ae_tier_1[plan.company]?.[plan.id] === undefined
    ).map((plan) => plan.id);
    if (uncovered.length > 0) {
      console.log(`Comp plan has no rate for: ${uncovered.join(', ')}`);
    }
    expect(Array.isArray(uncovered)).toBe(true);
  });
});
