import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { revealSensitive } from '@/lib/onboarding/sensitiveFields';

// GET /api/portal/admin/sensitive/[uid] - Sensitive onboarding fields for one user.
// VERIFIED admin only (real Firebase ID token via Authorization: Bearer header,
// NOT a client-supplied UID). Default returns only masked last-4 (no decryption,
// no log). With ?reveal=true it decrypts the full SSN/DL# AND writes an audit row.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ uid: string }> }
) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const { uid } = await params;
    const reveal = request.nextUrl.searchParams.get('reveal') === 'true';

    const snap = await adminDb.collection('userSensitive').doc(uid).get();
    if (!snap.exists) {
      return NextResponse.json({ ssnLast4: null, dlLast4: null, ssn: null, dlNumber: null });
    }

    const data = snap.data() as {
      ssnEncrypted?: string;
      dlNumberEncrypted?: string;
      ssnLast4?: string;
      dlLast4?: string;
    };

    if (!reveal) {
      return NextResponse.json({
        ssnLast4: data.ssnLast4 ?? null,
        dlLast4: data.dlLast4 ?? null,
        ssn: null,
        dlNumber: null,
      });
    }

    const revealed = revealSensitive({
      ssnEncrypted: data.ssnEncrypted,
      dlNumberEncrypted: data.dlNumberEncrypted,
    });

    await adminDb.collection('sensitiveAccessLog').add({
      targetUid: uid,
      revealedBy: gate.uid,
      revealedByName: gate.name,
      at: new Date(),
    });

    return NextResponse.json({
      ssnLast4: data.ssnLast4 ?? null,
      dlLast4: data.dlLast4 ?? null,
      ssn: revealed.ssn ?? null,
      dlNumber: revealed.dlNumber ?? null,
    });
  } catch (error) {
    console.error('Error reading sensitive fields:', error);
    return NextResponse.json({ error: 'Failed to read sensitive fields' }, { status: 500 });
  }
}
