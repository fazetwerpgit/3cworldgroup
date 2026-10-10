import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { parseFiberReport } from '@/lib/fiberReport/parseReport';
import { isOlderReport, mailSentAt, newestStamp, reportAsOf, type ReportStamp } from '@/lib/fiberReport/staleReport';
import { buildNameIndex, matchOrder } from '@/lib/fiberReport/matchReps';
import { closeHandoffs, handoffOwner, readHandoffs } from '@/lib/fiberReport/dealerHandoff';
import { assignDealerToUser } from '@/lib/fiberReport/assignDealer';
import { rematchUnmatchedOrders } from '@/lib/fiberReport/rematch';
import { syncInstallDatesFromOrders, type OrderSale } from '@/lib/sales/installDateSync';
import { readStoredOrders, sendCarrierNotices } from '@/lib/fiberReport/carrierNotices';
import type {
  CarrierNoticeCounts,
  FiberOrder,
  FiberReportImport,
  InstallDateSyncCounts,
} from '@/types/fiberOrder';

export const maxDuration = 60;
export const runtime = 'nodejs';

type InboundAttachment = {
  Name?: string;
  Content?: string;
  ContentType?: string;
};

type InboundPayload = {
  From?: string;
  Subject?: string;
  /** The mail's own Date header (RFC 2822). */
  Date?: string;
  Attachments?: InboundAttachment[];
};

function importLog(
  receivedAt: string,
  filename: string,
  fromEmail: string,
  subject: string,
  values: Partial<Pick<FiberReportImport, 'rowCounts' | 'upserted' | 'matchedReps' | 'unmatchedRepNames' | 'error' | 'installDateSync' | 'carrierNotices'>>
): FiberReportImport {
  return {
    receivedAt,
    filename,
    fromEmail,
    subject,
    rowCounts: values.rowCounts ?? {},
    upserted: values.upserted ?? 0,
    matchedReps: values.matchedReps ?? 0,
    unmatchedRepNames: values.unmatchedRepNames ?? [],
    error: values.error ?? null,
    installDateSync: values.installDateSync ?? null,
    carrierNotices: values.carrierNotices ?? null,
  };
}

async function writeImportLog(entry: FiberReportImport): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  await adminDb.collection('fiberReportImports').add(entry);
}

/** The newest report stamp loaded so far, as config/fiberReportStatus records it. */
function loadedStamp(status: FirebaseFirestore.DocumentData | undefined): ReportStamp {
  return { sentAt: status?.lastReportSentAt ?? null, asOf: status?.lastReportAsOf ?? null };
}

// Token-gated health check: confirms whether reports are landing without
// needing Firestore credentials — returns last-import status + recent log.
export async function GET(request: NextRequest) {
  const expectedToken = process.env.POSTMARK_INBOUND_TOKEN;
  const suppliedToken = request.nextUrl.searchParams.get('token');
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  if (!adminDb) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
  }

  // Ops actions (same token gate): ?rematch=1 re-runs matching over unmatched
  // orders; ?assign=<dealerId>:<uid> maps a dealer id to a user and backfills.
  const assignParam = request.nextUrl.searchParams.get('assign');
  if (assignParam) {
    const [dealerId, userId] = assignParam.split(':');
    const result = await assignDealerToUser(dealerId ?? '', userId ?? '');
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true, assigned: dealerId, updated: result.updated });
  }
  if (request.nextUrl.searchParams.get('rematch')) {
    const result = await rematchUnmatchedOrders();
    return NextResponse.json({ ok: true, ...result });
  }

  const status = await adminDb.collection('config').doc('fiberReportStatus').get();
  const imports = await adminDb
    .collection('fiberReportImports')
    .orderBy('receivedAt', 'desc')
    .limit(10)
    .get();
  // Display names + dealer map + unmatched tally help diagnose rep-matching
  // misses (token-gated, no PII beyond names).
  const users = await adminDb.collection('users').get();
  const repMap = await adminDb.collection('config').doc('fiberRepMap').get();
  const unmatchedSnapshot = await adminDb
    .collection('fiberOrders')
    .where('matchedUserId', '==', null)
    .get();
  const unmatchedByRep: Record<string, number> = {};
  for (const doc of unmatchedSnapshot.docs) {
    const data = doc.data();
    const key = `${data?.repName ?? '?'} (${data?.repDealerId ?? '?'})`;
    unmatchedByRep[key] = (unmatchedByRep[key] ?? 0) + 1;
  }
  return NextResponse.json({
    status: status.exists ? status.data() : null,
    imports: imports.docs.map((doc) => doc.data()),
    userDisplayNames: users.docs
      .map((doc) => ({ uid: doc.id, displayName: doc.data()?.displayName ?? '' }))
      .filter((entry) => entry.displayName)
      .sort((a, b) => a.displayName.localeCompare(b.displayName)),
    dealerMap: repMap.data()?.map ?? {},
    unmatchedByRep,
  });
}

export async function POST(request: NextRequest) {
  const expectedToken = process.env.POSTMARK_INBOUND_TOKEN;
  const suppliedToken = request.nextUrl.searchParams.get('token');
  if (!expectedToken || suppliedToken !== expectedToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const receivedAt = new Date().toISOString();
  let body: InboundPayload = {};
  let filename = '';
  let fromEmail = '';
  let subject = '';

  try {
    body = (await request.json()) as InboundPayload;
    fromEmail = typeof body.From === 'string' ? body.From : '';
    subject = typeof body.Subject === 'string' ? body.Subject : '';

    const attachment = (Array.isArray(body.Attachments) ? body.Attachments : []).find(
      (candidate) => typeof candidate?.Name === 'string' && candidate.Name.toLowerCase().endsWith('.xlsx')
    );

    if (!attachment) {
      if (!adminDb) throw new Error('Database not configured');
      await adminDb.collection('config').doc('lastInboundEmail').set(
        { from: fromEmail, subject, receivedAt },
        { merge: true }
      );
      await writeImportLog(
        importLog(receivedAt, filename, fromEmail, subject, { error: 'no xlsx attachment' })
      );
      return NextResponse.json({ ok: true, skipped: true });
    }

    filename = attachment.Name!;
    if (typeof attachment.Content !== 'string' || !attachment.Content) {
      throw new Error('xlsx attachment has no base64 content');
    }
    const parsed = await parseFiberReport(Buffer.from(attachment.Content, 'base64'), receivedAt);
    if (!adminDb) throw new Error('Database not configured');

    // An older daily report re-sent with the new one is skipped: loading it
    // would move install dates back (and push reps) until the newer file lands.
    // The check and the stamp are one transaction, taken before anything is
    // written: two overlapping deliveries can't both pass on the same old stamp,
    // and the stamp only ever moves forward.
    const stamp: ReportStamp = {
      sentAt: mailSentAt(body.Date),
      asOf: reportAsOf(parsed.orders, receivedAt.slice(0, 10)),
    };
    const statusRef = adminDb.collection('config').doc('fiberReportStatus');
    const claimed = await adminDb.runTransaction(async (transaction) => {
      const loaded = loadedStamp((await transaction.get(statusRef)).data());
      if (isOlderReport(stamp, loaded)) return false;
      const newest = newestStamp(stamp, loaded);
      transaction.set(statusRef, { lastReportSentAt: newest.sentAt, lastReportAsOf: newest.asOf }, { merge: true });
      return true;
    });
    if (!claimed) {
      console.log(`[inbound-report] skipped an older report (sent ${stamp.sentAt}, as of ${stamp.asOf})`);
      await writeImportLog(
        importLog(receivedAt, filename, fromEmail, subject, {
          rowCounts: parsed.rowCounts,
          error: `skipped: older report (sent ${stamp.sentAt ?? 'unknown'}, as of ${stamp.asOf ?? 'unknown'})`,
        })
      );
      return NextResponse.json({ ok: true, skipped: 'older_report' });
    }

    const mapSnapshot = await adminDb.collection('config').doc('fiberRepMap').get();
    const mappedDealerIds: Record<string, string> = {
      ...((mapSnapshot.data()?.map ?? {}) as Record<string, string>),
    };
    const usersSnapshot = await adminDb.collection('users').get();
    const userEntries = usersSnapshot.docs.map((user) => ({
      uid: user.id,
      displayName: user.data()?.displayName,
    }));
    const usersByName = buildNameIndex(userEntries);

    const newlyMapped: Record<string, string> = {};
    // By code (or name) first: that is also what tells a handoff its borrower
    // is selling on their own code again.
    const byCode = parsed.orders.map((order) => {
      const dealerId = order.repDealerId.trim();
      const userId = matchOrder(
        { repDealerId: dealerId, repName: order.repName },
        mappedDealerIds,
        usersByName,
        userEntries,
      );
      if (userId && dealerId && !mappedDealerIds[dealerId]) {
        mappedDealerIds[dealerId] = userId;
        newlyMapped[dealerId] = userId;
      }
      return userId;
    });
    const { handoffs, closed: closedHandoffs } = closeHandoffs(
      readHandoffs(mapSnapshot.data()?.handoffs),
      parsed.orders.map((order, index) => ({ ...order, matchedUserId: byCode[index] })),
    );

    const unmatchedRepNames = new Set<string>();
    let matchedReps = 0;
    const now = new Date().toISOString();
    const orders: FiberOrder[] = parsed.orders.map((order, index) => {
      const matchedUserId = handoffOwner(order, handoffs) ?? byCode[index];
      if (matchedUserId) matchedReps += 1;
      else if (order.repName.trim()) unmatchedRepNames.add(order.repName.trim());
      return { ...order, matchedUserId, updatedAt: now };
    });

    if (Object.keys(newlyMapped).length || closedHandoffs.length) {
      if (closedHandoffs.length) console.log(`[inbound-report] dealer handoffs ended: ${closedHandoffs.join(', ')}`);
      // Firestore merge is shallow for nested maps; write the complete map so
      // a new name match cannot erase existing dealer-id mappings.
      await adminDb.collection('config').doc('fiberRepMap').set({ map: mappedDealerIds, handoffs }, { merge: true });
    }

    // What each order was before this report: the carrier notices tell a rep
    // only about changes. Never throws; null when it could not be read.
    const storedOrders = await readStoredOrders(orders);

    // Each chunk commits only while this report still holds the claim: once a
    // newer report has claimed, its rows must not be overwritten by this one's.
    const fiberOrders = adminDb.collection('fiberOrders');
    let superseded = false;
    for (let offset = 0; offset < orders.length && !superseded; offset += 450) {
      superseded = await adminDb.runTransaction(async (transaction) => {
        if (isOlderReport(stamp, loadedStamp((await transaction.get(statusRef)).data()))) return true;
        for (const order of orders.slice(offset, offset + 450)) {
          transaction.set(fiberOrders.doc(order.id), order, { merge: true });
        }
        return false;
      });
    }

    // The orders are stored, so the report is safe. Everything below is a
    // follow-up: the carrier's date is pushed onto the matching sales and the
    // reps are told. It runs AFTER the upsert and inside its own try — a
    // failure here must not fail a report that already landed, or the next
    // delivery would be the only way to recover data we already have.
    let installDateSync: InstallDateSyncCounts | null = null;
    let carrierNotices: CarrierNoticeCounts | null = null;
    // A newer report may have claimed the stamp while this one was upserting.
    // Its sync and notices are the ones that count; running this older one's
    // after them would move dates back and tell reps twice.
    if (!superseded) superseded = isOlderReport(stamp, loadedStamp((await statusRef.get()).data()));
    if (superseded) {
      console.log(`[inbound-report] a newer report landed meanwhile; skipped the sync for (sent ${stamp.sentAt}, as of ${stamp.asOf})`);
    } else {
      let orderSales = new Map<string, OrderSale>();
      try {
        const { changes, orderSales: linked, ...counts } = await syncInstallDatesFromOrders({ orders, now: new Date() });
        installDateSync = counts;
        orderSales = linked;
        if (changes.length) {
          console.log(`[inbound-report] moved ${changes.length} install date(s) from the report`);
        }
        if (counts.orderNumbersFilled || counts.orderNumberSkippedConflict) {
          console.log(
            `[inbound-report] filled ${counts.orderNumbersFilled} order number(s) from the report; ${counts.orderNumberSkippedConflict} left empty (number already on another live sale, or another rep's row)`
          );
        }
      } catch (error) {
        console.error('[inbound-report] install date sync failed', error);
      }

      // Missed installs, carrier cancels and disconnects, told to the rep once.
      if (storedOrders) {
        try {
          carrierNotices = await sendCarrierNotices({ orders, stored: storedOrders, orderSales, now: new Date() });
        } catch (error) {
          console.error('[inbound-report] carrier notices failed', error);
        }
      }
    }

    await statusRef.set(
      {
        lastReportAt: receivedAt,
        lastFilename: filename,
        lastUpserted: orders.length,
      },
      { merge: true }
    );
    await writeImportLog(
      importLog(receivedAt, filename, fromEmail, subject, {
        rowCounts: parsed.rowCounts,
        upserted: orders.length,
        matchedReps,
        unmatchedRepNames: [...unmatchedRepNames],
        error: null,
        installDateSync,
        carrierNotices,
      })
    );

    return NextResponse.json({ ok: true, upserted: orders.length, installDateSync });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[inbound-report]', message);
    try {
      await writeImportLog(importLog(receivedAt, filename, fromEmail, subject, { error: message }));
    } catch (logError) {
      console.error('[inbound-report] failed to write import log', logError);
    }
    return NextResponse.json({ ok: false });
  }
}
