import { FieldValue } from 'firebase-admin/firestore';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { loadAvailability } from '@/lib/solar/server';
import type { SolarLeadStatus } from '@/lib/solar/leadFields';
import { announceBookingCancel, isLiveBooking, stageBookingCancel } from '@/lib/solar/bookingCancel';
import {
  SOLAR_STAGE_ROLES,
  STAGE_HISTORY_MAX,
  isForwardMove,
  parseStageRequest,
  readStage,
  readStageHistory,
  statusForStage,
  type SolarStageEntry,
} from '@/lib/solar/leadStage';
import { SOLAR_CLOSE_FORBIDDEN, canCloseSolarLead, isSoldLead, isSoldStage } from '@/lib/solar/closePermission';

type VerifiedGate = Extract<Awaited<ReturnType<typeof requireVerifiedUser>>, { ok: true }>;

/** Admins/owners, the sales-side solar roles, and the consultants set in Admin > Solar > Setup. */
async function maySetStage(gate: VerifiedGate): Promise<boolean> {
  if (gate.isAdmin) return true;
  if (gate.solarRole && (SOLAR_STAGE_ROLES as readonly string[]).includes(gate.solarRole)) return true;
  const consultants = await loadAvailability().catch(() => []);
  return consultants.some((c) => c.consultantUid === gate.uid);
}

// PATCH /api/portal/solar/leads/{id}/stage - the sales department records
// where a lead is after the appointment. Bearer ID token (portal or app).
// Body: {stage: 'appointment_demoed' | 'site_survey' | 'permit_approved' |
//   'install_scheduled' | 'install_complete' | 'pto' | null,
//   outcome?: 'sale' | 'no_sale' | 'proposal_sent'}  (outcome required with
//   appointment_demoed, refused with any other stage)
// -> 200 {success, id, stage, outcome, status, entry, cancelledBookingId?}
// Who: admins/owners (any move, back too, and stage null to clear it), the
// closer solar roles and Setup consultants (forward moves, or another outcome
// on the same stage). Reps get 403. A sale (appointment_demoed + sale or any
// later stage), and any write to a lead that is already sold, is owners' only
// (canCloseSolarLead): everyone else gets 403. Every change appends to stageHistory
// ({stage, outcome?, at, byUid}) and keeps status in step: a sale or any later
// stage reads 'sold', no sale 'lost', otherwise open ('booked' while a live
// booking holds a slot, else 'new'). No sale also cancels a live booking
// exactly like Mark lost (same transaction, same notices) and answers its id
// as cancelledBookingId.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!(await maySetStage(gate))) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    const db = adminDb;

    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const parsed = parseStageRequest(await request.json().catch(() => null));
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { stage, outcome } = parsed.value;

    const ref = db.collection('solarLeads').doc(id);
    const now = new Date();
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return { error: 'Lead not found', code: 404 } as const;
      const data = (snap.data() ?? {}) as Record<string, unknown>;
      const current = readStage(data);
      // Selling a lead, or any change to a sold one (another sold stage,
      // un-selling it, no sale), is owners' only (lib/solar/closePermission).
      if ((isSoldLead(data) || isSoldStage(stage, outcome)) && !canCloseSolarLead(gate, data)) {
        return { error: SOLAR_CLOSE_FORBIDDEN, code: 403 } as const;
      }
      if (!gate.isAdmin && !isForwardMove(current, { stage, outcome }, data.status)) {
        return { error: 'Only an admin can move a lead back a stage or change a closed outcome', code: 403 } as const;
      }

      const bookingId = typeof data.bookingId === 'string' ? data.bookingId : '';
      const bookingRef = bookingId ? db.collection('solarBookings').doc(bookingId) : null;
      const booking = bookingRef ? await tx.get(bookingRef) : null;
      const live = isLiveBooking(booking);
      // No sale closes the lead as lost; the rest of the sales stages leave
      // it open ('booked' while a live booking holds its slot) or sold.
      const status: SolarLeadStatus = statusForStage(stage, outcome) ?? (live ? 'booked' : 'new');

      const entry: SolarStageEntry = { stage, ...(outcome ? { outcome } : {}), at: now.toISOString(), byUid: gate.uid };
      const history = [...readStageHistory(data.stageHistory), entry].slice(-STAGE_HISTORY_MAX);
      const statusChanged = data.status !== status;
      const leadPatch = {
        stage,
        stageOutcome: outcome,
        stageHistory: history,
        stageChangedAt: now,
        stageChangedBy: gate.uid,
        status,
        ...(statusChanged ? { statusChangedAt: now, statusChangedBy: gate.uid } : {}),
        // A sales stage supersedes a pre-qualification no sale.
        ...(data.noSaleReason !== undefined ? { noSaleReason: FieldValue.delete() } : {}),
        updatedAt: now,
      };
      // Lost, as Mark lost does it: the live booking is cancelled in this same
      // transaction (slot freed, bookingId cleared) and announced after.
      if (status === 'lost' && live && bookingRef && booking) {
        const cancelled = stageBookingCancel(tx, {
          id: bookingId, bookingRef, booking, leadRef: ref, lead: snap, by: gate.uid, now, leadPatch,
        });
        return { status, entry, cancelled } as const;
      }
      tx.update(ref, leadPatch);
      return { status, entry, cancelled: null } as const;
    });

    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.code });
    if (result.cancelled) await announceBookingCancel(result.cancelled, gate.uid, 'lost');
    return NextResponse.json({
      success: true, id, stage, outcome, status: result.status, entry: result.entry,
      ...(result.cancelled ? { cancelledBookingId: result.cancelled.id } : {}),
    });
  } catch (error) {
    console.error('Error setting solar lead stage:', error);
    return NextResponse.json({ error: 'Failed to set the lead stage' }, { status: 500 });
  }
}
