import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { buildNameIndex, matchOrder } from '@/lib/fiberReport/matchReps';

const BATCH_SIZE = 450;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readDealerMap(data: FirebaseFirestore.DocumentData | undefined): Record<string, string> {
  const value = data?.map;
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
  );
}

async function updateOrders(
  orders: FirebaseFirestore.QueryDocumentSnapshot[],
  userIdByOrder: Map<string, string>,
  updatedAt: string,
): Promise<void> {
  if (!adminDb) throw new Error('Database not configured');
  const fiberOrders = adminDb.collection('fiberOrders');
  for (let offset = 0; offset < orders.length; offset += BATCH_SIZE) {
    const batch = adminDb.batch();
    for (const order of orders.slice(offset, offset + BATCH_SIZE)) {
      batch.update(order.ref ?? fiberOrders.doc(order.id), {
        matchedUserId: userIdByOrder.get(order.id),
        updatedAt,
      });
    }
    await batch.commit();
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!adminDb) {
      return NextResponse.json({ error: 'Database not configured' }, { status: 500 });
    }

    const gate = await requireVerifiedUser(request);
    if (!gate.ok) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }

    const callerDoc = await adminDb.collection('users').doc(gate.uid).get();
    if (!callerDoc.exists) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }
    const callerData = callerDoc.data() ?? {};
    if (callerData.role !== 'admin' && callerData.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }
    if (!isRecord(body) || typeof body.action !== 'string') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    if (body.action !== 'assign' && body.action !== 'rematch') {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    let dealerId = '';
    let userId = '';
    if (body.action === 'assign') {
      if (
        typeof body.dealerId !== 'string' ||
        !body.dealerId.trim() ||
        typeof body.userId !== 'string' ||
        !body.userId.trim()
      ) {
        return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
      }
      dealerId = body.dealerId.trim();
      userId = body.userId.trim();
    }

    const configRef = adminDb.collection('config').doc('fiberRepMap');
    const mapSnapshot = await configRef.get();
    const dealerMap = readDealerMap(mapSnapshot.data());

    if (body.action === 'assign') {
      const targetUser = await adminDb.collection('users').doc(userId).get();
      if (!targetUser.exists) {
        return NextResponse.json({ error: 'User not found' }, { status: 404 });
      }

      dealerMap[dealerId] = userId;
      await configRef.set({ map: dealerMap }, { merge: true });

      const snapshot = await adminDb
        .collection('fiberOrders')
        .where('repDealerId', '==', dealerId)
        .get();
      const updatedAt = new Date().toISOString();
      const updates = new Map(snapshot.docs.map((order) => [order.id, userId]));
      await updateOrders(snapshot.docs, updates, updatedAt);
      return NextResponse.json({ ok: true, updated: snapshot.docs.length });
    }

    const usersSnapshot = await adminDb.collection('users').get();
    const nameIndex = buildNameIndex(
      usersSnapshot.docs.map((user) => ({ uid: user.id, displayName: user.data()?.displayName })),
    );
    const snapshot = await adminDb
      .collection('fiberOrders')
      .where('matchedUserId', '==', null)
      .get();
    const updatedAt = new Date().toISOString();
    const updates = new Map<string, string>();
    let learnedDealerMap = false;
    for (const order of snapshot.docs) {
      const data = order.data();
      const repDealerId = typeof data?.repDealerId === 'string' ? data.repDealerId.trim() : '';
      const repName = typeof data?.repName === 'string' ? data.repName : '';
      const userId = matchOrder({ repDealerId, repName }, dealerMap, nameIndex);
      if (!userId) continue;
      updates.set(order.id, userId);
      if (repDealerId && !dealerMap[repDealerId]) {
        dealerMap[repDealerId] = userId;
        learnedDealerMap = true;
      }
    }

    await updateOrders(snapshot.docs.filter((order) => updates.has(order.id)), updates, updatedAt);
    // `dealerMap` is the complete map, so a shallow merge cannot erase older
    // mappings when rematch learns a new dealer id.
    if (learnedDealerMap) await configRef.set({ map: dealerMap }, { merge: true });

    return NextResponse.json({
      ok: true,
      updated: updates.size,
      stillUnmatched: snapshot.docs.length - updates.size,
    });
  } catch (error) {
    console.error('Error assigning fiber status:', error);
    return NextResponse.json({ error: 'Failed to assign fiber status' }, { status: 500 });
  }
}
