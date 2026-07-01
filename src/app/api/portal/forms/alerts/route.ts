import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedManagement, requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { FORM_ALERTS } from '@/lib/forms/notifySubmission';

// GET - management reads the current per-form alert toggles (default on when unset).
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedManagement(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const overrides: Record<string, boolean> = {};
  try {
    const snap = await adminDb.collection('formAlerts').get();
    snap.forEach((d) => {
      overrides[d.id] = d.data()?.enabled !== false;
    });
  } catch {
    // fall through to defaults
  }

  const forms = Object.values(FORM_ALERTS).map((f) => ({
    key: f.key,
    label: f.label,
    enabled: overrides[f.key] ?? true, // default ON
  }));
  return NextResponse.json({ forms });
}

// PUT - admins only. Body { key, enabled }. Flips one form's alert toggle.
export async function PUT(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const key = typeof body.key === 'string' ? body.key : '';
    if (!(key in FORM_ALERTS)) {
      return NextResponse.json({ error: 'Unknown form key' }, { status: 400 });
    }
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be true or false' }, { status: 400 });
    }

    await adminDb.collection('formAlerts').doc(key).set({
      enabled: body.enabled,
      updatedBy: gate.uid,
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving form alert toggle:', error);
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 });
  }
}
