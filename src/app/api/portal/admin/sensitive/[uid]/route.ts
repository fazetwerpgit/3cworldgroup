import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { revealSensitive } from '@/lib/onboarding/sensitiveFields';
import { isOwner, resolveRoles } from '@/types';

// GET /api/portal/admin/sensitive/[uid] - Sensitive onboarding fields for one user.
// VERIFIED admin only (real Firebase ID token via Authorization: Bearer header,
// NOT a client-supplied UID). Default returns only masked last-4 (no decryption,
// no log). With ?reveal=true it decrypts AND writes an audit row.
//
// The SSN (tax ID) is OWNER ONLY (Jacob, 10/18/2026): an admin's response
// carries no `ssn` or `ssnLast4` field at all, only `ssnOnFile` (true/false),
// and an admin's reveal decrypts the DL# alone. The DL# stays admin/owner.
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

    const caller = await adminDb.collection('users').doc(gate.uid).get();
    const callerIsOwner = isOwner(resolveRoles(caller.get('role'), caller.get('fieldRole')).role);

    const snap = await adminDb.collection('userSensitive').doc(uid).get();
    const data = (snap.exists ? snap.data() : {}) as {
      ssnEncrypted?: string;
      dlNumberEncrypted?: string;
      ssnLast4?: string;
      dlLast4?: string;
    };
    const ssnOnFile = Boolean(data.ssnEncrypted || data.ssnLast4);
    // Owners see the SSN fields; everyone else gets no SSN field, masked or not.
    const ssnFields = (ssn: string | null) =>
      callerIsOwner ? { ssnLast4: data.ssnLast4 ?? null, ssn } : {};

    if (!snap.exists) {
      return NextResponse.json({ ssnOnFile: false, dlLast4: null, dlNumber: null, ...ssnFields(null) });
    }

    if (!reveal) {
      return NextResponse.json({
        ssnOnFile,
        dlLast4: data.dlLast4 ?? null,
        dlNumber: null,
        ...ssnFields(null),
      });
    }

    // The owner tier is closed to admins everywhere else (edit, delete, role),
    // so only an owner may decrypt an owner's sensitive fields.
    if (!callerIsOwner) {
      const target = await adminDb.collection('users').doc(uid).get();
      if (isOwner(resolveRoles(target.get('role'), target.get('fieldRole')).role)) {
        return NextResponse.json(
          { error: "Forbidden: only an owner can reveal an owner's sensitive fields" },
          { status: 403 }
        );
      }
    }

    // A non-owner's reveal never decrypts the SSN.
    const revealed = revealSensitive({
      ssnEncrypted: callerIsOwner ? data.ssnEncrypted : undefined,
      dlNumberEncrypted: data.dlNumberEncrypted,
    });

    await adminDb.collection('sensitiveAccessLog').add({
      targetUid: uid,
      revealedBy: gate.uid,
      revealedByName: gate.name,
      fields: callerIsOwner ? ['ssn', 'dlNumber'] : ['dlNumber'],
      at: new Date(),
    });

    return NextResponse.json({
      ssnOnFile,
      dlLast4: data.dlLast4 ?? null,
      dlNumber: revealed.dlNumber ?? null,
      ...ssnFields(revealed.ssn ?? null),
    });
  } catch (error) {
    console.error('Error reading sensitive fields:', error);
    return NextResponse.json({ error: 'Failed to read sensitive fields' }, { status: 500 });
  }
}
