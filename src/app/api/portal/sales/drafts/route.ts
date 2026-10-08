import { NextRequest, NextResponse } from 'next/server';
import { adminDb, initError } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import {
  SALE_DRAFTS_COLLECTION,
  draftDocId,
  parseDraftInput,
  serializeDraft,
} from '@/lib/sales/knockDrafts';

// Sale drafts from 3C Doors (see lib/sales/knockDrafts.ts). A draft always
// belongs to the caller: the rep is stamped from the verified token, never
// from the body. Pending and inactive accounts are refused by
// requireVerifiedUser, the same as for logging a sale.

const MAX_OPEN_DRAFTS = 100;

// GET /api/portal/sales/drafts - the caller's open drafts, newest sale first
export async function GET(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured', details: initError || 'adminDb is null' },
        { status: 500 }
      );
    }
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    // Composite index: saleDrafts salesRepId ASC + status ASC + soldAt DESC.
    const snap = await adminDb
      .collection(SALE_DRAFTS_COLLECTION)
      .where('salesRepId', '==', gate.uid)
      .where('status', '==', 'open')
      .orderBy('soldAt', 'desc')
      .limit(MAX_OPEN_DRAFTS)
      .get();

    const drafts = snap.docs.map((doc) => serializeDraft(doc.id, doc.data()));
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error('Error loading sale drafts:', error);
    return NextResponse.json(
      { error: 'Failed to load sale drafts', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

// POST /api/portal/sales/drafts - create the draft for a Sold, or update it.
// Idempotent on (rep, clientId): the same Sold always lands on one draft.
export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured', details: initError || 'adminDb is null' },
        { status: 500 }
      );
    }
    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    const parsed = parseDraftInput(body);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: 400 });
    }
    const input = parsed.draft;

    const id = draftDocId(gate.uid, input.clientId);
    const ref = adminDb.collection(SALE_DRAFTS_COLLECTION).doc(id);
    const now = new Date();

    // A transaction so a repeat can never reopen a draft that a submit or a
    // dismiss closed in the meantime.
    await adminDb.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const fields: Record<string, unknown> = {
        address: input.address,
        soldAt: new Date(input.soldAt),
        updatedAt: now,
      };
      if (input.customerName !== undefined) fields.customerName = input.customerName;
      if (input.planId !== undefined) fields.planId = input.planId;
      if (input.houseId) fields.houseId = input.houseId;
      if (input.knockId) fields.knockId = input.knockId;
      if (input.campaignId) fields.campaignId = input.campaignId;

      if (!snap.exists) {
        tx.create(ref, {
          customerName: null,
          planId: null,
          houseId: null,
          knockId: null,
          campaignId: null,
          ...fields,
          salesRepId: gate.uid,
          salesRepName: gate.name,
          clientId: input.clientId,
          source: input.source,
          status: 'open',
          saleId: null,
          createdAt: now,
        });
        return;
      }
      // Finished or dismissed: the repeat is acknowledged and changes nothing.
      if (snap.data()?.status !== 'open') return;
      tx.update(ref, fields);
    });

    return NextResponse.json({ id });
  } catch (error) {
    console.error('Error saving sale draft:', error);
    return NextResponse.json(
      { error: 'Failed to save sale draft', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
