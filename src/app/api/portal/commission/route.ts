import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  CommissionConfig,
  DEFAULT_COMMISSION,
  FieldRole,
  resolveRoles,
} from '@/types';

const FIELD_ROLES: FieldRole[] = ['entry_rep', 'l1_manager', 'l2_manager'];

// Load tiers from config/commission, falling back to the zero placeholders.
async function loadTiers(): Promise<{
  tiers: CommissionConfig[];
  updatedAt: Date | null;
  updatedByName: string | null;
}> {
  const doc = await adminDb!.collection('config').doc('commission').get();
  if (!doc.exists) {
    return { tiers: DEFAULT_COMMISSION, updatedAt: null, updatedByName: null };
  }
  const data = doc.data()!;
  // Re-key stored tiers against the role list so a malformed doc can't
  // hide or duplicate a tier
  const stored = new Map<string, CommissionConfig>(
    (data.tiers ?? []).map((t: CommissionConfig) => [t.fieldRole, t])
  );
  const tiers = DEFAULT_COMMISSION.map(
    (fallback) => stored.get(fallback.fieldRole) ?? fallback
  );
  return {
    tiers,
    updatedAt: data.updatedAt?.toDate() ?? null,
    updatedByName: data.updatedByName ?? null,
  };
}

// GET /api/portal/commission?userId=xxx - Pay structure, visibility-scoped.
// Field users get ONLY their own tier (L2 > L1 > Entry - nobody sees a
// higher tier's numbers). Platform users (admin/operations) get all tiers.
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const userId = request.nextUrl.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const userDoc = await adminDb.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const data = userDoc.data();
    const { role, fieldRole } = resolveRoles(data?.role, data?.fieldRole);
    const { tiers, updatedAt, updatedByName } = await loadTiers();

    // Platform users see the full structure (they administer it)
    if (role) {
      return NextResponse.json({ tiers, scope: 'all', updatedAt, updatedByName });
    }

    if (!fieldRole) {
      return NextResponse.json(
        { error: 'User has no role assigned' },
        { status: 400 }
      );
    }

    // Field users: own tier only
    const own = tiers.find((t) => t.fieldRole === fieldRole);
    return NextResponse.json({
      tiers: own ? [own] : [],
      scope: 'own',
      updatedAt,
      updatedByName,
    });
  } catch (error) {
    console.error('Error fetching commission config:', error);
    return NextResponse.json(
      { error: 'Failed to fetch pay structure' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/commission - Admin edits the rates (editable config -
// real numbers TBD from leadership; zero placeholders until then).
export async function PUT(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { tiers, updatedBy, updatedByName } = body;

    if (!Array.isArray(tiers) || !updatedBy) {
      return NextResponse.json(
        { error: 'Missing required fields: tiers (array), updatedBy' },
        { status: 400 }
      );
    }

    // Only admins may edit rates
    const editorDoc = await adminDb.collection('users').doc(updatedBy).get();
    const editor = editorDoc.exists ? resolveRoles(editorDoc.data()?.role, editorDoc.data()?.fieldRole) : null;
    if (editor?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only admins can edit the pay structure' },
        { status: 403 }
      );
    }

    // Validate every tier: known role, sane numbers
    const cleaned: CommissionConfig[] = [];
    for (const tier of tiers) {
      if (!FIELD_ROLES.includes(tier.fieldRole)) {
        return NextResponse.json(
          { error: `Unknown fieldRole: ${tier.fieldRole}` },
          { status: 400 }
        );
      }
      const baseRate = Number(tier.baseRate);
      const overrideRate = tier.overrideRate !== undefined ? Number(tier.overrideRate) : undefined;
      if (!Number.isFinite(baseRate) || baseRate < 0) {
        return NextResponse.json(
          { error: `Invalid baseRate for ${tier.fieldRole}` },
          { status: 400 }
        );
      }
      if (overrideRate !== undefined && (!Number.isFinite(overrideRate) || overrideRate < 0)) {
        return NextResponse.json(
          { error: `Invalid overrideRate for ${tier.fieldRole}` },
          { status: 400 }
        );
      }
      cleaned.push({
        fieldRole: tier.fieldRole,
        baseRate,
        ...(overrideRate !== undefined ? { overrideRate } : {}),
        ...(typeof tier.notes === 'string' && tier.notes.trim()
          ? { notes: tier.notes.trim().slice(0, 500) }
          : {}),
      });
    }
    if (cleaned.length !== FIELD_ROLES.length) {
      return NextResponse.json(
        { error: `Expected exactly ${FIELD_ROLES.length} tiers (one per field role)` },
        { status: 400 }
      );
    }

    await adminDb.collection('config').doc('commission').set({
      tiers: cleaned,
      updatedBy,
      updatedByName: updatedByName || '',
      updatedAt: new Date(),
    });

    return NextResponse.json({ success: true, message: 'Pay structure updated' });
  } catch (error) {
    console.error('Error updating commission config:', error);
    return NextResponse.json(
      { error: 'Failed to update pay structure' },
      { status: 500 }
    );
  }
}
