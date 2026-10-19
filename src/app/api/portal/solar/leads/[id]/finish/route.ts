import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { userRateLimited } from '@/lib/userRateLimits';
import { requireSolarUser } from '@/lib/solar/server';
import { sendLeadAlertOnce } from '@/lib/solar/leadAlert';

// POST /api/portal/solar/leads/{id}/finish - the rep is done with this
// homeowner (New customer, or Exit after saving a lead). Sends the lead alert
// if no booking sent it yet; with no booking it reads "No appointment booked".
// Idempotent: -> 200 {success, id, sent} where sent says whether this call
// sent the alert. Only the rep who created the lead, or an admin.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    const limited = userRateLimited('formSubmit', gate.uid);
    if (limited) return limited;
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const snap = await adminDb.collection('solarLeads').doc(id).get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (snap.get('repUid') !== gate.uid && !gate.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const sent = await sendLeadAlertOnce(id);
    return NextResponse.json({ success: true, id, sent });
  } catch (error) {
    console.error('Error finishing solar lead:', error);
    return NextResponse.json({ error: 'Failed to finish solar lead' }, { status: 500 });
  }
}
