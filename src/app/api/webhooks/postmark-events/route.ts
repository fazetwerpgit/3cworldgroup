import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { heldInviteEmailEventPatch, inviteEmailEventPatch, parseInviteEmailEvent } from '@/lib/recruiting/inviteEmailStatus';

export const runtime = 'nodejs';

// Postmark outbound webhook (Delivery + Bounce) for onboarding invite emails.
// Gated like inbound-report: a shared secret in the ?token= query string, here
// POSTMARK_EVENTS_TOKEN. Anything that is not an invite email, or no longer
// matches the invite's latest send, is acknowledged and ignored (a 2xx stops
// Postmark retrying it). An invite event that may belong to a send not saved
// yet is held on the invite until that send's result is written.

function authorized(request: NextRequest): boolean {
  const expected = process.env.POSTMARK_EVENTS_TOKEN;
  const supplied = request.nextUrl.searchParams.get('token');
  if (!expected || !supplied) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const ignored = () => NextResponse.json({ ok: true, applied: false });

export async function POST(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const db = adminDb;
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  const body: unknown = await request.json().catch(() => null);
  const event = parseInviteEmailEvent(body);
  if (!event) return ignored();

  try {
    const invites = db.collection('onboardingInvites');
    let ref: FirebaseFirestore.DocumentReference | null = null;
    if (event.inviteId) {
      ref = invites.doc(event.inviteId);
    } else if (event.messageId) {
      const match = await invites.where('postmarkMessageId', '==', event.messageId).limit(1).get();
      ref = match.docs[0]?.ref ?? null;
    }
    if (!ref) return ignored();
    const target = ref;

    const applied = await db.runTransaction(async (transaction) => {
      const snapshot = await transaction.get(target);
      if (!snapshot.exists) return false;
      const data = snapshot.data() ?? {};
      const patch = inviteEmailEventPatch(data, event);
      if (patch) {
        transaction.update(target, patch);
        return true;
      }
      // Possibly from a send whose result is not saved yet: keep it on the
      // invite for saveInviteEmailStatus rather than dropping it.
      const held = heldInviteEmailEventPatch(data, event);
      if (held) transaction.update(target, held);
      return false;
    });
    return NextResponse.json({ ok: true, applied });
  } catch (error) {
    console.error('[postmark-events] could not record an invite email event', error);
    return NextResponse.json({ error: 'Failed to record the event' }, { status: 500 });
  }
}
