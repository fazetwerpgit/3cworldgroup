import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireSolarUser } from '@/lib/solar/server';
import { isCreditTier } from '@/lib/solar/leadFields';

// PATCH /api/portal/solar/leads/{id} {creditTier: 'purchase_600' | 'lease_ppa_680'}
// -> 200 {success, id}. Only the rep who created the lead, or an admin.
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const gate = await requireSolarUser(request);
    if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
    if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

    const { id } = await params;
    if (!/^[A-Za-z0-9_-]{1,300}$/.test(id)) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    const body = await request.json().catch(() => null);
    const creditTier = (body as Record<string, unknown> | null)?.creditTier;
    if (!isCreditTier(creditTier)) return NextResponse.json({ error: 'Invalid creditTier' }, { status: 400 });

    const ref = adminDb.collection('solarLeads').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Lead not found' }, { status: 404 });
    if (snap.get('repUid') !== gate.uid && !gate.isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    await ref.update({ creditTier, updatedAt: new Date() });
    return NextResponse.json({ success: true, id });
  } catch (error) {
    console.error('Error updating solar lead:', error);
    return NextResponse.json({ error: 'Failed to update solar lead' }, { status: 500 });
  }
}
