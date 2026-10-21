import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin, requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { parseAvailability, type SolarAvailability } from '@/lib/solar/availability';
import { availabilityOf, loadConsultants } from '@/lib/solar/server';
import { disconnect as disconnectGoogle } from '@/lib/solar/google/connection';
import { parseConsultantContact, storedConsultantPhone, storedMeetLink } from '@/lib/solar/consultantContact';

const COLLECTION = 'solarAvailability';
const UID = /^[A-Za-z0-9_-]{1,128}$/;

type Params = { params: Promise<{ uid: string }> };

const NOT_CONSULTANT = 'Only a saved consultant can edit their hours.';

/**
 * Who may read or write `uid`'s card: an admin (the owner passes) any card, a
 * consultant their own card only. The uid compared is the verified caller's.
 */
async function cardGate(request: NextRequest, uid: string) {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return { ok: false as const, res: NextResponse.json({ error: gate.error }, { status: gate.status }) };
  if (!gate.isAdmin && gate.uid !== uid) {
    return { ok: false as const, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true as const, uid: gate.uid, isAdmin: gate.isAdmin };
}

// GET /api/portal/solar/consultants/{uid} -> 200 {consultant, seeded}. The
// consultant's own card (My availability), or any card for an admin. 403 for
// someone else's card, checked before any lookup; 404 when `uid` takes no
// consultations. Carries the Google status, never a token.
export async function GET(request: NextRequest, { params }: Params) {
  const { uid } = await params;
  const gate = await cardGate(request, uid);
  if (!gate.ok) return gate.res;
  if (!UID.test(uid)) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
  try {
    const { consultants, seeded } = await loadConsultants();
    const consultant = consultants.find((c) => c.consultantUid === uid);
    if (!consultant) return NextResponse.json({ error: 'Consultant not found' }, { status: 404 });
    return NextResponse.json({ consultant, seeded }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Error loading solar consultant:', error);
    return NextResponse.json({ error: 'Failed to load consultant' }, { status: 500 });
  }
}

/**
 * The stored shape of one consultant (the doc id is the uid). meetLink and
 * phone are written only when set, so a consultant without them has no keys.
 */
function docOf(
  a: Pick<SolarAvailability, 'name' | 'tz' | 'slotMin' | 'modes' | 'meetLink' | 'phone'>,
  by: string,
  at: Date
) {
  return {
    name: a.name,
    tz: a.tz,
    slotMin: a.slotMin,
    modes: { virtual: a.modes.virtual ?? [], in_person: a.modes.in_person ?? [] },
    ...(a.meetLink ? { meetLink: a.meetLink } : {}),
    ...(a.phone ? { phone: a.phone } : {}),
    updatedBy: by,
    updatedAt: at,
  };
}

// PUT /api/portal/solar/consultants/{uid} {tz, slotMin, modes[, meetLink][, phone]}
// -> 200 {consultant}. An admin adds or replaces anyone's hours; a consultant
// may replace their own (My availability), never add themselves (403 when they
// take no consultations yet) or touch anyone else's (403). The
// name is read from their users doc, never from the body. meetLink (a Google
// Meet link only) and phone go in the homeowner's confirmation email: each is
// normalized (lib/solar/consultantContact), '' or null clears it, and a key
// left out keeps what is saved. 400 {error, field} when one is not valid. While the collection is
// empty the GET serves the seed, so this write also saves every other seed
// consultant: saving one must not drop the rest.
export async function PUT(request: NextRequest, { params }: Params) {
  const { uid } = await params;
  const gate = await cardGate(request, uid);
  if (!gate.ok) return gate.res;
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  const db = adminDb;

  if (!UID.test(uid)) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  const body: unknown = await request.json().catch(() => null);
  const parsed = parseAvailability(body);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const contact = parseConsultantContact(body);
  if (!contact.ok) return NextResponse.json({ error: contact.error, field: contact.field }, { status: 400 });

  try {
    const user = await db.collection('users').doc(uid).get();
    if (!user.exists) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    const data = user.data() ?? {};
    const name = String(data.displayName ?? '').trim() || String(data.Email ?? data.email ?? '').trim() || 'Consultant';

    // Resolved before the transaction: the seed needs the owner/Jacob lookup.
    const { consultants: seed, seeded } = await loadConsultants();
    const now = new Date();
    const coll = db.collection(COLLECTION);
    const consultant = await db.runTransaction(async (tx) => {
      const existing = await tx.get(coll.limit(1));
      const mine = await tx.get(coll.doc(uid));
      // Not an admin: only an existing consultant (a saved doc, or one of the seed while it is served).
      if (!gate.isAdmin && !mine.exists && !(seeded && existing.empty && seed.some((s) => s.consultantUid === uid))) {
        return null;
      }
      const kept = mine.exists ? mine.data() ?? {} : {};
      const next = {
        consultantUid: uid,
        name,
        ...parsed.value,
        meetLink: contact.value.meetLink ?? storedMeetLink(kept.meetLink),
        phone: contact.value.phone ?? storedConsultantPhone(kept.phone),
      };
      if (seeded && existing.empty) {
        for (const s of seed) {
          if (s.consultantUid !== uid) tx.set(coll.doc(s.consultantUid), docOf(s, gate.uid, now));
        }
      }
      // The Google Calendar status is the connect flow's (lib/solar/google), not this form's: keep it.
      tx.set(coll.doc(uid), {
        ...docOf(next, gate.uid, now),
        ...(kept.googleCalendar ? { googleCalendar: kept.googleCalendar } : {}),
      });
      return next;
    });
    if (!consultant) return NextResponse.json({ error: NOT_CONSULTANT }, { status: 403 });
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

    // Their Google grant goes with them: revoked at Google, token doc deleted.
    // Best effort; a failure here never fails the removal. (Their booked
    // events stay on their calendar; a later cancel can't delete them.)
    await disconnectGoogle(uid).catch((error: unknown) => {
      console.error('solar consultant removal: google disconnect failed', error instanceof Error ? error.message : '');
    });

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
