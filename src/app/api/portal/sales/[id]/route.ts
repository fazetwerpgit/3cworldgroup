import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { invalidateFiberOrdersCache } from '@/lib/fiberReport/ordersCache';
import { Sale, SaleProduct } from '@/types';
import { requireVerifiedAdmin, requireVerifiedRequester } from '@/lib/auth/requireVerifiedAdmin';
import { parseSaleDateInput, parseInstallDateInput, installDayKey } from '@/lib/sales/saleDate';
import { validateOnePlanPerSale } from '@/lib/sales/planSelection';
import { priceSaleProducts } from '@/lib/sales/pricing';
import { hasSaleProof } from '@/lib/sales/proof';
import { proofPathFields, saleProofPaths, validateProofPaths } from '@/lib/sales/proofPaths';
import { loadCarrierOrders } from '@/lib/sales/carrierSnapshot';
import { carrierOrderForSale } from '@/lib/sales/installDateSync';

// GET /api/portal/sales/[id] - Get a single sale (owner or management)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // A sale row carries customer PII; only its owning rep or management may read
    // it. Gate before the lookup so an unauthorised caller cannot use the 404 to
    // probe which sale ids exist.
    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }

    const doc = await adminDb.collection('sales').doc(id).get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    const data = doc.data();

    // Ownership compares the sale's stored rep against the TOKEN uid — never a
    // client-supplied field. Admin/owner only: operations sees only their own.
    if (!requester.isAdmin && data?.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only view your own sales' },
        { status: 403 }
      );
    }

    const sale: Sale = {
      id: doc.id,
      ...data,
      saleDate: data?.saleDate?.toDate(),
      installDate: data?.installDate?.toDate(),
      installDatePreviousDate: data?.installDatePreviousDate?.toDate() ?? null,
      installDateChangedAt: data?.installDateChangedAt?.toDate(),
      createdAt: data?.createdAt?.toDate(),
      updatedAt: data?.updatedAt?.toDate(),
      approvedAt: data?.approvedAt?.toDate(),
      cancelledAt: data?.cancelledAt?.toDate(),
    } as Sale;

    return NextResponse.json({ sale });
  } catch (error) {
    console.error('Error fetching sale:', error);
    return NextResponse.json(
      { error: 'Failed to fetch sale' },
      { status: 500 }
    );
  }
}

// PUT /api/portal/sales/[id] - Update a sale
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Management only. Gate before the body is read so no client-supplied field
    // can influence who the caller is. A rep changes one thing on their own sale,
    // the install date, through ./install-date; every other correction goes
    // through management, so a rep cannot rewrite a sale's plan, value or
    // customer after it is logged.
    const requester = await requireVerifiedRequester(request);
    if (!requester.ok) {
      return NextResponse.json({ error: requester.error }, { status: requester.status });
    }
    if (!requester.isManagement) {
      return NextResponse.json(
        { error: 'Ask an admin to change this sale' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Ownership compares the sale's STORED salesRepId against the token uid.
    // Admin/owner only: operations edits only their own sales.
    const existing = doc.data();
    if (!requester.isAdmin && existing?.salesRepId !== requester.uid) {
      return NextResponse.json(
        { error: 'Forbidden: you can only edit your own sales' },
        { status: 403 }
      );
    }

    // Proof screenshots: when the edit sends either field, it sends the sale's
    // complete list (up to MAX_PROOF_SCREENSHOTS, each the rep's own sale-proof
    // upload) and both stored fields are rewritten from it. An edit that sends
    // neither leaves the stored screenshots alone.
    //
    // An older client knows only the single field and re-sends the stored first
    // path on every save; that must not collapse a multi-screenshot sale to one,
    // so an unchanged legacy-only value counts as not touching the proof.
    const legacyOnlyUnchanged =
      body.proofScreenshotPaths === undefined &&
      typeof body.proofScreenshotPath === 'string' &&
      body.proofScreenshotPath.trim() !== '' &&
      body.proofScreenshotPath.trim() === String(existing?.proofScreenshotPath ?? '').trim();
    const proofTouched =
      !legacyOnlyUnchanged &&
      (body.proofScreenshotPaths !== undefined || body.proofScreenshotPath !== undefined);
    let proofFields: ReturnType<typeof proofPathFields> | null = null;
    if (proofTouched) {
      // The sale's rep owns the proof, but an admin fixing a rep's sale uploads
      // under their OWN uid, so their prefix is accepted too (reps stay on
      // theirs). Paths already on the sale are kept whoever uploaded them.
      const proof = validateProofPaths(
        { proofScreenshotPaths: body.proofScreenshotPaths, proofScreenshotPath: body.proofScreenshotPath },
        String(existing?.salesRepId ?? ''),
        {
          alsoAllow: {
            uids: requester.isAdmin ? [requester.uid] : [],
            paths: saleProofPaths(existing ?? {}),
          },
        }
      );
      if (!proof.ok) {
        return NextResponse.json({ error: proof.error }, { status: 400 });
      }
      proofFields = proofPathFields(proof.paths);
    }

    // An edit may swap one proof for the other (drop the screenshots once an
    // order number is in, or the reverse) but may not strip a sale of its last
    // proof. A sale logged before the proof rule, with neither, can still be
    // corrected field by field.
    if (proofTouched || body.orderNumberOrBtn !== undefined) {
      const merged = {
        orderNumberOrBtn: String(
          body.orderNumberOrBtn !== undefined ? body.orderNumberOrBtn ?? '' : existing?.orderNumberOrBtn ?? ''
        ),
        proofScreenshotPaths: proofFields ? proofFields.proofScreenshotPaths : saleProofPaths(existing ?? {}),
      };
      const hadProof = hasSaleProof({
        orderNumberOrBtn: String(existing?.orderNumberOrBtn ?? ''),
        proofScreenshotPaths: saleProofPaths(existing ?? {}),
      });
      if (hadProof && !hasSaleProof(merged)) {
        return NextResponse.json(
          { error: 'Provide an order number / BTN or upload a screenshot' },
          { status: 400 }
        );
      }
    }

    // Allowlist of fields a sale edit may set. `status` stays off it: sale
    // approval was removed in Sep 2026 and no route writes the field any more,
    // so an edit must not become the back door that resurrects it. Ownership,
    // points and server-managed timestamps are immutable here for the same
    // reason — an edit is a correction, never a re-attribution.
    const EDITABLE_FIELDS = [
      'customerName',
      'customerPhone',
      'customerEmail',
      'customerAddress',
      'saleType',
      'products',
      'totalValue',
      'managerId',
      'notes',
      'orderNumberOrBtn',
      'proofScreenshotPath',
      'proofScreenshotPaths',
      'productSold',
    ] as const;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    for (const field of EDITABLE_FIELDS) {
      if (body[field] !== undefined) updateData[field] = body[field];
    }
    // Never the raw client values: both proof fields come from the validated list.
    delete updateData.proofScreenshotPath;
    delete updateData.proofScreenshotPaths;
    if (proofFields) Object.assign(updateData, proofFields);

    if (body.saleDate !== undefined && body.saleDate !== null && body.saleDate !== '') {
      const parsed = parseSaleDateInput(body.saleDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.saleDate = parsed.date;
    }

    if (body.installDate !== undefined && body.installDate !== null && body.installDate !== '') {
      const parsed = parseInstallDateInput(body.installDate);
      if (!parsed.ok) {
        return NextResponse.json({ error: parsed.error }, { status: 400 });
      }
      updateData.installDate = parsed.date;

      // Who moved the date, stamped only when the day actually changed — a rep
      // re-saving the form untouched has not changed anything and must not look
      // like they did. 'rep' is the sale's own rep correcting their own row;
      // anyone else reaching this point is management, so 'admin'. The carrier
      // report writes 'report' from lib/sales/installDateSync, never here.
      const previousDay = installDayKey(existing?.installDate);
      if (previousDay !== installDayKey(parsed.date)) {
        updateData.installDateSource =
          existing?.salesRepId === requester.uid ? 'rep' : 'admin';
        updateData.installDatePreviousDate = existing?.installDate ?? null;
        updateData.installDateChangedAt = new Date();
        updateData.installDateSetAt = updateData.installDateChangedAt;
        // An admin's reschedule is protected like a rep's: the carrier row the
        // sale stands on now is recorded, and the report sync overrides the
        // date only with carrier news since (installDateSync). Without it the
        // next morning's report would put back the day the admin just fixed.
        const carrierOrders = await loadCarrierOrders();
        const carrier = carrierOrders
          ? carrierOrderForSale({ id, data: existing ?? {} }, carrierOrders)
          : null;
        updateData.repEditOrderId = carrier?.orderId ?? null;
        updateData.repEditCarrierDate = carrier?.estInstallDate ?? null;
      }
    }

    // Products and value are priced server-side, never taken from the client.
    // Lines already on the sale keep their stored snapshot (see pricing.ts); new
    // ones come from the plan catalog, and an unknown productId is rejected. A
    // client totalValue is ignored — it is derived from the lines. totalPoints
    // stays immutable on edit, as before.
    delete updateData.totalValue;
    if (body.products !== undefined) {
      const priced = priceSaleProducts(body.products, (existing?.products ?? []) as SaleProduct[]);
      if (!priced.ok) {
        return NextResponse.json({ error: priced.error }, { status: 400 });
      }
      // One internet plan per address. Only checked when the edit actually sends
      // products: a sale logged before this rule existed can still be corrected
      // field by field without the route rejecting an edit that never touched it.
      const planError = validateOnePlanPerSale(priced.products);
      if (planError) {
        return NextResponse.json({ error: planError }, { status: 400 });
      }
      updateData.products = priced.products;
      updateData.totalValue = priced.totalValue;
    }

    // Written only if the sale is as it was read: a report sync or a rep's date
    // edit landing mid-edit must not be silently undone by this older view.
    try {
      if (doc.updateTime) await docRef.update(updateData, { lastUpdateTime: doc.updateTime });
      else await docRef.update(updateData);
    } catch (error) {
      const code = (error as { code?: unknown } | null)?.code;
      if (code === 9 || code === 'failed-precondition') {
        return NextResponse.json(
          { error: 'This sale just changed. Reload it and try again.' },
          { status: 409 }
        );
      }
      throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error updating sale:', error);
    return NextResponse.json(
      { error: 'Failed to update sale' },
      { status: 500 }
    );
  }
}

// DELETE /api/portal/sales/[id] - Delete a sale (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    if (!adminDb) {
      return NextResponse.json(
        { error: 'Database not configured' },
        { status: 500 }
      );
    }

    // Deleting a sale is destructive and admin-only.
    const gate = await requireVerifiedAdmin(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const docRef = adminDb.collection('sales').doc(id);
    const doc = await docRef.get();

    if (!doc.exists) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 });
    }

    // Clear any carrier order pointing at this sale BEFORE the delete. A
    // saleLink naming a deleted sale is worse than no link: the order comes back
    // as a red "Never logged" row, and the stale link permanently blocks the
    // address guess from ever re-joining it. Done first so a failure here leaves
    // the sale in place rather than stranding links behind a successful delete.
    // The equality is on a map subfield, which Firestore single-field indexes
    // automatically — no composite index is required.
    const linked = await adminDb
      .collection('fiberOrders')
      .where('saleLink.saleId', '==', id)
      .get();
    if (!linked.empty) {
      const batch = adminDb.batch();
      const updatedAt = new Date().toISOString();
      for (const order of linked.docs) {
        batch.update(order.ref, { saleLink: FieldValue.delete(), updatedAt });
      }
      await batch.commit();
      invalidateFiberOrdersCache();
    }

    await docRef.delete();

    return NextResponse.json({ success: true, clearedLinks: linked.size });
  } catch (error) {
    console.error('Error deleting sale:', error);
    return NextResponse.json(
      { error: 'Failed to delete sale' },
      { status: 500 }
    );
  }
}
