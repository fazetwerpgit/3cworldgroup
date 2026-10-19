import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedAdmin } from '@/lib/auth/requireVerifiedAdmin';

const MAX_RECIPIENTS = 20;
const UID = /^[A-Za-z0-9_-]{1,128}$/;

interface Recipient {
  uid: string;
  name: string;
  /** No users doc any more: alerts to this uid go nowhere. */
  missing?: true;
}

/** Names for the chips. A uid with no users doc keeps its place, named as removed. */
async function recipientsOf(uids: string[]): Promise<Recipient[]> {
  if (!adminDb || uids.length === 0) return [];
  const db = adminDb;
  const snaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
  return snaps.map((s, i) => {
    if (!s.exists) return { uid: uids[i], name: 'Removed user', missing: true };
    const data = s.data() ?? {};
    const name = String(data.displayName ?? '').trim() || String(data.Email ?? data.email ?? '').trim();
    return { uid: uids[i], name: name || 'Unnamed user' };
  });
}

function cleanUids(value: unknown): string[] {
  return Array.isArray(value) ? [...new Set(value.filter((v): v is string => typeof v === 'string' && UID.test(v)))] : [];
}

// GET /api/portal/settings/solar -> 200 {leadAlertUids, notifyOwner, recipients}.
// Admin only. What lib/solar/server.ts reads for solar alerts: with notifyOwner
// off (the default) the owner gets nothing and lead alerts go to Jacob only;
// with it on, they go to leadAlertUids (Jacob when that is empty).
export async function GET(request: NextRequest) {
  const gate = await requireVerifiedAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  try {
    const snap = await adminDb.collection('settings').doc('solar').get();
    const data = (snap.exists ? snap.data() : undefined) ?? {};
    const leadAlertUids = cleanUids(data.leadAlertUids);
    return NextResponse.json({
      leadAlertUids,
      notifyOwner: data.notifyOwner === true,
      recipients: await recipientsOf(leadAlertUids),
    });
  } catch (error) {
    console.error('Error loading solar settings:', error);
    return NextResponse.json({ error: 'Failed to load solar settings' }, { status: 500 });
  }
}

// PUT /api/portal/settings/solar {leadAlertUids: string[], notifyOwner: boolean}
// -> 200 {leadAlertUids, notifyOwner, recipients}. Admin only; both fields are
// required and every uid must be a portal user.
export async function PUT(request: NextRequest) {
  const gate = await requireVerifiedAdmin(request);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });
  if (!adminDb) return NextResponse.json({ error: 'Database not configured' }, { status: 500 });

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  const raw = body?.leadAlertUids;
  const notifyOwner = body?.notifyOwner;
  if (typeof notifyOwner !== 'boolean') {
    return NextResponse.json({ error: 'notifyOwner must be true or false' }, { status: 400 });
  }
  if (!Array.isArray(raw) || raw.length > MAX_RECIPIENTS || raw.some((v) => typeof v !== 'string' || !UID.test(v))) {
    return NextResponse.json({ error: `leadAlertUids must be up to ${MAX_RECIPIENTS} user ids` }, { status: 400 });
  }
  const leadAlertUids = [...new Set(raw as string[])];

  try {
    const recipients = await recipientsOf(leadAlertUids);
    if (recipients.some((r) => r.missing)) return NextResponse.json({ error: 'Unknown user in leadAlertUids' }, { status: 400 });
    await adminDb
      .collection('settings')
      .doc('solar')
      .set({ leadAlertUids, notifyOwner, updatedBy: gate.uid, updatedAt: new Date() }, { merge: true });
    return NextResponse.json({ leadAlertUids, notifyOwner, recipients });
  } catch (error) {
    console.error('Error saving solar settings:', error);
    return NextResponse.json({ error: 'Failed to save solar settings' }, { status: 500 });
  }
}
