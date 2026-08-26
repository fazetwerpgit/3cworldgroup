import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { parseFiberReport } from '@/lib/fiberReport/parseReport';
import { buildNameIndex, matchOrder } from '@/lib/fiberReport/matchReps';
import type { FiberOrder, FiberReportImport } from '@/types/fiberOrder';

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
  Attachments?: InboundAttachment[];
};

function importLog(
  receivedAt: string,
  filename: string,
  fromEmail: string,
  subject: string,
  values: Partial<Pick<FiberReportImport, 'rowCounts' | 'upserted' | 'matchedReps' | 'unmatchedRepNames' | 'error'>>
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
  };
}

async function writeImportLog(entry: FiberReportImport): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  await adminDb.collection('fiberReportImports').add(entry);
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
      .map((doc) => doc.data()?.displayName ?? '')
      .filter(Boolean)
      .sort(),
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

    const mapSnapshot = await adminDb.collection('config').doc('fiberRepMap').get();
    const mappedDealerIds: Record<string, string> = {
      ...((mapSnapshot.data()?.map ?? {}) as Record<string, string>),
    };
    const usersSnapshot = await adminDb.collection('users').get();
    const usersByName = buildNameIndex(
      usersSnapshot.docs.map((user) => ({ uid: user.id, displayName: user.data()?.displayName })),
    );

    const newlyMapped: Record<string, string> = {};
    const unmatchedRepNames = new Set<string>();
    let matchedReps = 0;
    const now = new Date().toISOString();
    const orders: FiberOrder[] = parsed.orders.map((order) => {
      const dealerId = order.repDealerId.trim();
      const matchedUserId = matchOrder(
        { repDealerId: dealerId, repName: order.repName },
        mappedDealerIds,
        usersByName,
      );
      if (matchedUserId && dealerId && !mappedDealerIds[dealerId]) {
        mappedDealerIds[dealerId] = matchedUserId;
        newlyMapped[dealerId] = matchedUserId;
      }
      if (matchedUserId) matchedReps += 1;
      else if (order.repName.trim()) unmatchedRepNames.add(order.repName.trim());
      return { ...order, matchedUserId, updatedAt: now };
    });

    if (Object.keys(newlyMapped).length) {
      // Firestore merge is shallow for nested maps; write the complete map so
      // a new name match cannot erase existing dealer-id mappings.
      await adminDb.collection('config').doc('fiberRepMap').set({ map: mappedDealerIds }, { merge: true });
    }

    const fiberOrders = adminDb.collection('fiberOrders');
    for (let offset = 0; offset < orders.length; offset += 450) {
      const batch = adminDb.batch();
      for (const order of orders.slice(offset, offset + 450)) {
        batch.set(fiberOrders.doc(order.id), order, { merge: true });
      }
      await batch.commit();
    }

    await adminDb.collection('config').doc('fiberReportStatus').set(
      { lastReportAt: receivedAt, lastFilename: filename, lastUpserted: orders.length },
      { merge: true }
    );
    await writeImportLog(
      importLog(receivedAt, filename, fromEmail, subject, {
        rowCounts: parsed.rowCounts,
        upserted: orders.length,
        matchedReps,
        unmatchedRepNames: [...unmatchedRepNames],
        error: null,
      })
    );

    return NextResponse.json({ ok: true, upserted: orders.length });
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
