import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  requireVerifiedManagement,
  requireVerifiedRequester,
} from '@/lib/auth/requireVerifiedAdmin';
import { COMP_PLAN_MARGIN, COMP_PLAN_RATES, COMP_PLAN_VERSION } from '@/data/compPlan.generated';
import {
  COMP_PLAN_ROLES,
  CompPlanCompanyRates,
  CompPlanMargin,
  CompPlanRates,
  PAY_DELAY_DAYS,
  resolveCompRole,
} from '@/types';

// Rates and margin live in two Firestore docs on purpose: config/compPlan is
// readable by anyone this route serves, config/compPlanMargin is owner-only, so
// the rep-facing payload physically cannot carry the "3C Receives" numbers.
const RATES_DOC = 'compPlan';
const MARGIN_DOC = 'compPlanMargin';

async function loadRates(): Promise<{
  rates: Partial<CompPlanRates>;
  version: string;
  updatedAt: Date | null;
  updatedByName: string | null;
}> {
  const doc = await adminDb!.collection('config').doc(RATES_DOC).get();
  // Before the seed script runs, the committed plan is the plan.
  if (!doc.exists) {
    return { rates: COMP_PLAN_RATES, version: COMP_PLAN_VERSION, updatedAt: null, updatedByName: null };
  }
  const data = doc.data()!;
  return {
    rates: (data.rates as Partial<CompPlanRates>) ?? COMP_PLAN_RATES,
    version: data.version ?? COMP_PLAN_VERSION,
    updatedAt: data.updatedAt?.toDate() ?? null,
    updatedByName: data.updatedByName ?? null,
  };
}

async function loadMargin(): Promise<CompPlanMargin> {
  const doc = await adminDb!.collection('config').doc(MARGIN_DOC).get();
  if (!doc.exists) return COMP_PLAN_MARGIN;
  return (doc.data()!.margin as CompPlanMargin) ?? COMP_PLAN_MARGIN;
}

// Rejects anything that is not company -> plan -> non-negative number.
function invalidCompanyRates(value: unknown, label: string): string | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return `Invalid rates for ${label}`;
  }
  for (const [company, plans] of Object.entries(value as Record<string, unknown>)) {
    if (!plans || typeof plans !== 'object' || Array.isArray(plans)) {
      return `Invalid rates for ${label} / ${company}`;
    }
    for (const [planId, rate] of Object.entries(plans as Record<string, unknown>)) {
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0) {
        return `Invalid rate for ${label} / ${company} / ${planId}`;
      }
    }
  }
  return null;
}

// GET /api/portal/comp-plan - per-install pay rates, visibility-scoped.
// Field users get ONLY the slice their role is paid from (legacy roles fall back
// to AE Tier 1). Admin/operations get every role's rates. The owner additionally
// gets the margin — no other caller ever receives that key.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    // requireVerifiedRequester is the token-verified caller lookup: it returns
    // the resolved role/fieldRole from the user doc, so scoping never trusts input.
    const gate = await requireVerifiedRequester(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { rates, version, updatedAt, updatedByName } = await loadRates();
    const base = {
      payDelayDays: PAY_DELAY_DAYS,
      version,
      updatedAt: updatedAt ? updatedAt.toISOString() : null,
      updatedByName,
    };

    // Platform users administer the plan, so they see every role's rates.
    if (gate.role) {
      return NextResponse.json({
        ...base,
        scope: 'all',
        rates,
        ...(gate.role === 'owner' ? { margin: await loadMargin() } : {}),
      });
    }

    const compRole = resolveCompRole(gate.fieldRole);
    const own: CompPlanCompanyRates | null = compRole ? rates[compRole] ?? null : null;
    return NextResponse.json({
      ...base,
      scope: 'own',
      fieldRole: gate.fieldRole ?? null,
      compRole,
      rates: own,
    });
  } catch (error) {
    console.error('Error fetching comp plan:', error);
    return NextResponse.json({ error: 'Failed to fetch comp plan' }, { status: 500 });
  }
}

// PUT /api/portal/comp-plan - owner only. Admins administer people, not pay:
// the comp plan and its margin are the finance tier's alone.
export async function PUT(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedManagement(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    if (!gate.isOwner) {
      return NextResponse.json({ error: 'Forbidden: owner access required' }, { status: 403 });
    }

    const body = await request.json();
    const { rates, margin, version } = body ?? {};

    if (!rates || typeof rates !== 'object' || Array.isArray(rates)) {
      return NextResponse.json({ error: 'Missing required field: rates' }, { status: 400 });
    }
    for (const [role, companyRates] of Object.entries(rates as Record<string, unknown>)) {
      if (!(COMP_PLAN_ROLES as readonly string[]).includes(role)) {
        return NextResponse.json({ error: `Unknown comp plan role: ${role}` }, { status: 400 });
      }
      const problem = invalidCompanyRates(companyRates, role);
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }
    if (margin !== undefined) {
      const problem = invalidCompanyRates(margin, 'margin');
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
    }

    const updatedAt = new Date();
    await adminDb.collection('config').doc(RATES_DOC).set({
      rates,
      version: typeof version === 'string' && version.trim() ? version.trim().slice(0, 40) : COMP_PLAN_VERSION,
      updatedAt,
      updatedBy: gate.uid,
      updatedByName: gate.name,
    });
    if (margin !== undefined) {
      await adminDb.collection('config').doc(MARGIN_DOC).set({
        margin,
        version: COMP_PLAN_VERSION,
        updatedAt,
      });
    }

    return NextResponse.json({ success: true, message: 'Comp plan updated' });
  } catch (error) {
    console.error('Error updating comp plan:', error);
    return NextResponse.json({ error: 'Failed to update comp plan' }, { status: 500 });
  }
}
