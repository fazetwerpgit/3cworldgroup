import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin, requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';

const DEFAULT_TARGET_SALES = 7;

// GET /api/portal/settings/weekly-challenge — any signed-in, active portal user.
// A missing or malformed doc falls back to the code default (no target set yet).
// A failed read is a 500, never the default: callers show "Couldn't load"
// instead of a made-up target.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Server is not configured' }, { status: 500 });
  }

  const caller = await requireVerifiedUser(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  try {
    const snap = await adminDb.collection('settings').doc('weeklyChallenge').get();
    const targetSales = snap.exists ? snap.data()?.targetSales : undefined;
    if (typeof targetSales !== 'number' || !Number.isInteger(targetSales) || targetSales < 1 || targetSales > 99) {
      return NextResponse.json({ targetSales: DEFAULT_TARGET_SALES });
    }
    return NextResponse.json({ targetSales });
  } catch (error) {
    console.error('Error reading weekly challenge setting:', error);
    return NextResponse.json({ error: 'Failed to load weekly challenge target' }, { status: 500 });
  }
}

// PUT /api/portal/settings/weekly-challenge — admin only. Caller's role is
// resolved server-side from their users/{uid} doc, never trusted from the body.
export async function PUT(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Server is not configured' }, { status: 500 });
  }

  const caller = await requireVerifiedAdmin(request);
  if (!caller.ok) {
    return NextResponse.json({ error: caller.error }, { status: caller.status });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const targetSales = (body as { targetSales?: unknown } | null)?.targetSales;
  if (typeof targetSales !== 'number' || !Number.isInteger(targetSales) || targetSales < 1 || targetSales > 99) {
    return NextResponse.json({ error: 'targetSales must be an integer between 1 and 99' }, { status: 400 });
  }

  try {
    await adminDb.collection('settings').doc('weeklyChallenge').set(
      {
        targetSales,
        updatedBy: caller.uid,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    return NextResponse.json({ success: true, targetSales });
  } catch (error) {
    console.error('Error saving weekly challenge setting:', error);
    return NextResponse.json({ error: 'Failed to save weekly challenge target' }, { status: 500 });
  }
}
