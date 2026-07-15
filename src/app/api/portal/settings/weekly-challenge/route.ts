import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminAuth, adminDb } from '@/lib/firebase/admin';

const DEFAULT_TARGET_SALES = 7;

function getBearerToken(request: NextRequest): string {
  const header = request.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

async function verifyCaller(request: NextRequest): Promise<{ uid: string } | null> {
  if (!adminAuth) return null;
  const token = getBearerToken(request);
  if (!token) return null;
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    return { uid: decoded.uid };
  } catch {
    return null;
  }
}

// GET /api/portal/settings/weekly-challenge — any signed-in portal user.
// Never 500s on a missing/malformed doc; falls back to the code default so
// the leaderboard banner always has something to render.
export async function GET(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ targetSales: DEFAULT_TARGET_SALES });
  }

  const caller = await verifyCaller(request);
  if (!caller) {
    return NextResponse.json({ error: 'Missing or invalid authentication token' }, { status: 401 });
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
    return NextResponse.json({ targetSales: DEFAULT_TARGET_SALES });
  }
}

// PUT /api/portal/settings/weekly-challenge — admin only. Caller's role is
// resolved server-side from their users/{uid} doc, never trusted from the body.
export async function PUT(request: NextRequest) {
  if (!adminAuth || !adminDb) {
    return NextResponse.json({ error: 'Server is not configured' }, { status: 500 });
  }

  const caller = await verifyCaller(request);
  if (!caller) {
    return NextResponse.json({ error: 'Missing or invalid authentication token' }, { status: 401 });
  }

  const callerDoc = await adminDb.collection('users').doc(caller.uid).get();
  if (!callerDoc.exists || callerDoc.data()?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden: admin access required' }, { status: 403 });
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
