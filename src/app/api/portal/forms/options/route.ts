import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser, requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { getResolvedFormOptions } from '@/lib/forms/resolveFormOptions';
import { EDITABLE_OPTION_KEYS, OptionKey } from '@/lib/forms/formOptionsRegistry';

// GET - any verified user gets the resolved (default + override) option lists.
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  const options = await getResolvedFormOptions();
  return NextResponse.json({ options });
}

// PUT - admins only. Body { key, values }. Overwrites one key's override list.
export async function PUT(request: NextRequest) {
  try {
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const body = await request.json();
    const key = body.key as OptionKey;
    if (!EDITABLE_OPTION_KEYS.includes(key)) {
      return NextResponse.json({ error: 'Invalid or non-editable option key' }, { status: 400 });
    }
    if (!Array.isArray(body.values)) {
      return NextResponse.json({ error: 'values must be an array' }, { status: 400 });
    }
    if (body.values.length > 100) {
      return NextResponse.json({ error: 'Too many values (max 100)' }, { status: 400 });
    }
    // Reject bad input outright so an admin's mistake surfaces instead of being
    // silently dropped: every entry must be a non-empty string. Trimming and
    // de-duplication are then applied as cleaning (not errors).
    const seen = new Set<string>();
    const values: string[] = [];
    for (const raw of body.values) {
      if (typeof raw !== 'string') {
        return NextResponse.json({ error: 'Each value must be text' }, { status: 400 });
      }
      const v = raw.trim().slice(0, 120);
      if (!v) {
        return NextResponse.json({ error: 'Values cannot be blank' }, { status: 400 });
      }
      if (seen.has(v)) continue;
      seen.add(v);
      values.push(v);
    }

    await adminDb.collection('formOptions').doc(key).set({
      values,
      updatedBy: gate.uid,
      updatedAt: new Date(),
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving form options:', error);
    return NextResponse.json({ error: 'Failed to save options' }, { status: 500 });
  }
}
