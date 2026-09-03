import { describe, it, expect } from 'vitest';
import {
  COMP_PLAN_ROLES,
  LEGACY_ROLE_RATE_FALLBACK,
  PAY_DELAY_DAYS,
  isCompPlanRole,
  rateFor,
  resolveCompRole,
} from './compPlan';
import { COMP_PLAN_RATES } from '@/data/compPlan.generated';

describe('COMP_PLAN_ROLES', () => {
  it('includes internal_rep and every IBO level', () => {
    expect(COMP_PLAN_ROLES).toContain('internal_rep');
    expect(COMP_PLAN_ROLES).toContain('ibo_level_1');
    expect(COMP_PLAN_ROLES).toContain('ibo_level_2');
    expect(COMP_PLAN_ROLES).toContain('ibo_level_3');
    expect(COMP_PLAN_ROLES).toContain('ibo_level_4');
  });

  it('does not include the legacy roles it replaces', () => {
    for (const legacy of Object.keys(LEGACY_ROLE_RATE_FALLBACK)) {
      expect(isCompPlanRole(legacy)).toBe(false);
    }
  });
});

describe('resolveCompRole', () => {
  it('returns a comp plan role unchanged', () => {
    expect(resolveCompRole('ae_tier_2')).toBe('ae_tier_2');
    expect(resolveCompRole('director')).toBe('director');
  });

  it('falls back to AE Tier 1 for the legacy roles', () => {
    expect(resolveCompRole('entry_rep')).toBe('ae_tier_1');
    expect(resolveCompRole('entry_level_rep')).toBe('ae_tier_1');
    expect(resolveCompRole('l1_manager')).toBe('ae_tier_1');
    expect(resolveCompRole('l2_manager')).toBe('ae_tier_1');
  });

  it('returns null when there is no role at all', () => {
    expect(resolveCompRole(undefined)).toBeNull();
    expect(resolveCompRole(null)).toBeNull();
    expect(resolveCompRole('not_a_role')).toBeNull();
  });

  it('pays an admin or owner on the Internal Rep scale', () => {
    // Assigning a platform role clears fieldRole, so this fallback is the only
    // thing standing between a back-office seller and an empty pay plan.
    expect(resolveCompRole(undefined, 'admin')).toBe('internal_rep');
    expect(resolveCompRole(undefined, 'owner')).toBe('internal_rep');
  });

  it('gives operations no comp role of its own', () => {
    expect(resolveCompRole(undefined, 'operations')).toBeNull();
  });

  it('prefers a field role over the platform fallback', () => {
    expect(resolveCompRole('director', 'admin')).toBe('director');
    expect(resolveCompRole('entry_rep', 'owner')).toBe('ae_tier_1');
  });
});

describe('rateFor', () => {
  it('reads a real rate out of the generated plan', () => {
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_1', 'att', 'att-1gig')).toBe(150);
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_2', 'att', 'att-1gig')).toBe(200);
  });

  it('returns 0 for an unknown role, company or plan', () => {
    expect(rateFor(COMP_PLAN_RATES, 'entry_rep', 'att', 'att-1gig')).toBe(0);
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_1', 'brightspeed', 'att-1gig')).toBe(0);
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_1', 'att', 'att-8gig')).toBe(0);
  });

  it('returns 0 for missing rates or missing arguments', () => {
    expect(rateFor(null, 'ae_tier_1', 'att', 'att-1gig')).toBe(0);
    expect(rateFor(undefined, 'ae_tier_1', 'att', 'att-1gig')).toBe(0);
    expect(rateFor(COMP_PLAN_RATES, null, 'att', 'att-1gig')).toBe(0);
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_1', '', 'att-1gig')).toBe(0);
    expect(rateFor(COMP_PLAN_RATES, 'ae_tier_1', 'att', '')).toBe(0);
  });

  it('returns 0 rather than a non-number when the stored plan is malformed', () => {
    const malformed = { ae_tier_1: { att: { 'att-1gig': 'lots' } } } as unknown as typeof COMP_PLAN_RATES;
    expect(rateFor(malformed, 'ae_tier_1', 'att', 'att-1gig')).toBe(0);
  });
});

describe('PAY_DELAY_DAYS', () => {
  it('is the two-week post-install pay delay', () => {
    expect(PAY_DELAY_DAYS).toBe(14);
  });
});
