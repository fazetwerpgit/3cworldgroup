import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';
import { parseAvailability, type SolarAvailability } from '@/lib/solar/availability';
import { availabilityOf, loadConsultants } from '@/lib/solar/server';

const COLLECTION = 'solarAvailability';
const UID = /^[A-Za-z0-9_-]{1,128}$/;

type Params = { params: Promise<{ uid: string }> };

/** The stored shape of one consultant (the doc id is the uid). */
function docOf(a: Pick<SolarAvailability, 'name' | 'tz' | 'slotMin' | 'modes'>, by: string, at: Date) {
  return {
    name: a.name,
    tz: a.tz,
    slotMin: a.slotMin,
    modes: { virtual: a.modes.virtual ?? [], in_person: a.modes.in_person ?? [] },
    updatedBy: by,
    updatedAt: at,
  };
}

// PUT /api/portal/solar/consultants/{uid} {tz, slotMin, modes} -> 200
// {consultant}. Admin only. Adds or replaces that person's hours; the name is
// read from their users doc, never from the body. While the collection is
// empty the GET serves the seed, so this write also saves every other seed
// consultant: saving one must not drop the rest.
export async function PUT(request: NextRequest, { params }: Params) {
  const gate = await requireVerifiedAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const db = adminDb;

  const { uid } = await params;
  if (!UID.test(uid)) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const parsed = parseAvailability(await request.json().catch(() => null));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  try {
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const data = user.data() ?? {};
    const name = String(data.displayName ?? '').trim() || String(data.Email ?? data.email ?? '').trim() || 'Consultant';

    // Resolved before the transaction: the seed needs the owner/Jacob lookup.
    const { consultants: seed, seeded } = await loadConsultants();
    const now = new Date();
    const consultant = { consultantUid: uid, name, ...parsed.value };
    const coll = db.collection(COLLECTION);
    await db.runTransaction(async (tx) => {
      const existing = await tx.get(coll.limit(1));
      if (seeded && existing.empty) {
        for (const s of seed) {
          if (s.consultantUid !== uid) tx.set(coll.doc(s.consultantUid), docOf(s, gate.uid, now));
        }
      }
      tx.set(coll.doc(uid), docOf(consultant, gate.uid, now));
    });
    return NextResponse.json({ consultant });
  } catch (error) {
    console.error('Error saving solar consultant:', error);
    return NextResponse.json({ error: 'Failed to save consultant' }, { status: 500 });
  }
}

// DELETE /api/portal/solar/consultants/{uid} -> 200 {success, futureBookings}.
// Admin only. Homeowners stop seeing this person's slots; consultations already
// booked stay booked, and `futureBookings` says how many, so the admin can
// cancel or move them. The last consultant can't be removed (409): with none,
// nothing could be booked. While the seed is served, the other seed
// consultants are saved first, so removing one doesn't bring it back.
export async function DELETE(request: NextRequest, { params }: Params) {
  const gate = await requireVerifiedAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const db = adminDb;

  const { uid } = await params;
  if (!UID.test(uid)) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });

  try {
    const { consultants: seed, seeded } = await loadConsultants();
    const now = new Date();
    const coll = db.collection(COLLECTION);
    const outcome = await db.runTransaction(async (tx) => {
      const snap = await tx.get(coll);
      const current = snap.empty && seeded ? seed : snap.docs.map((d) => availabilityOf(d.id, d.data()));
      if (!current.some((c) => c.consultantUid === uid)) return 'missing' as const;
      if (current.length === 1) return 'last' as const;
      if (snap.empty) {
        for (const s of current) {
          if (s.consultantUid !== uid) tx.set(coll.doc(s.consultantUid), docOf(s, gate.uid, now));
        }
      } else {
        tx.delete(coll.doc(uid));
      }
      return 'removed' as const;
    });
    if (outcome === 'missing') return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
    if (outcome === 'last') {
      return NextResponse.json({ error: 'Add another consultant before removing the last one' }, { status: 409 });
    }

    // Equality filter only (no composite index); time and status are checked here.
    const bookings = await db.collection('solarBookings').where('consultantUid', '==', uid).get();
    const nowIso = now.toISOString();
    const futureBookings = bookings.docs.filter(
      (d) => d.get('status') !== 'cancelled' && String(d.get('start') ?? '') >= nowIso
    ).length;
    return NextResponse.json({ success: true, futureBookings });
  } catch (error) {
    console.error('Error removing solar consultant:', error);
    return NextResponse.json({ error: 'Failed to remove consultant' }, { status: 500 });
  }
}
