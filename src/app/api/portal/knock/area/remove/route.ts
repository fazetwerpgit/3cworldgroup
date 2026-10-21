import { NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { splitForRemove } from '@/lib/knock/area/areaDraw';
import type { HouseDoc } from '@/lib/knock/area/types';
import {
  IMPORT_RETRY_AFTER_MS,
  areaCaller,
  areaError,
  areaOk,
  campaignAccess,
  grpcCode,
  isDocId,
  readJsonObject,
} from '@/lib/knock/area/server';

// POST /api/portal/knock/area/remove (3c-knock docs/AREA_IMPORT_API.md section 5).
// Body: { campaignId, areaImportId, dryRun } -> 200 { removable, kept } (dryRun) or { removed, kept }.
// Deletes only the area's untouched doors (isUntouchedDoor: no knock, result, visit, imported
// result, note or No Soliciting sign), each with a lastUpdateTime precondition so a door a rep
// changed after the read stays (counted in kept). Idempotent: a second call removes 0.

export const maxDuration = 30;

type DoorSnap = FirebaseFirestore.QueryDocumentSnapshot;

/** BulkWriter deletes with preconditions; returns how many were deleted (FAILED_PRECONDITION = kept). */
async function deleteDoors(db: Firestore, doors: readonly DoorSnap[]): Promise<number> {
  if (doors.length === 0) return 0;
  const writer = db.bulkWriter();
  writer.onWriteError((error) => grpcCode(error) !== 9 && error.failedAttempts < 5);
  let removed = 0;
  const failures: unknown[] = [];
  const writes = doors.map((d) =>
    writer.delete(d.ref, { lastUpdateTime: d.updateTime }).then(
      () => {
        removed++;
      },
      (error: unknown) => {
        if (grpcCode(error) !== 9) failures.push(error);
      }
    )
  );
  await writer.close();
  await Promise.all(writes);
  if (failures.length > 0) throw failures[0];
  return removed;
}

export async function POST(request: NextRequest) {
  try {
    const gate = await areaCaller(request);
    if (!gate.ok) return gate.response;
    if (!adminDb) return areaError(500, 'internal', {}, 'Database not configured');
    const db = adminDb;

    const body = await readJsonObject(request);
    if (!body) return areaError(400, 'invalid_request');
    const { campaignId, areaImportId, dryRun } = body;
    if (!isDocId(campaignId) || !isDocId(areaImportId) || typeof dryRun !== 'boolean') {
      return areaError(400, 'invalid_request');
    }

    const access = await campaignAccess(db, gate.caller, campaignId);
    if (!access.ok) return access.response;

    const ref = db.collection('areaImports').doc(areaImportId);
    const areaSnap = await ref.get();
    const area = (areaSnap.data() ?? {}) as Record<string, unknown>;
    if (!areaSnap.exists || area.campaignId !== campaignId) return areaError(404, 'area_not_found');
    if (area.status === 'writing') return areaError(409, 'import_in_progress', { retryAfterMs: IMPORT_RETRY_AFTER_MS });

    const createdAt = typeof area.createdAt === 'number' ? area.createdAt : 0;
    // Equality only (no composite index); knocks use the existing (campaignId, createdAt) index.
    const [doorSnap, knockSnap] = await Promise.all([
      db.collection('houses').where('campaignId', '==', campaignId).where('areaImportId', '==', areaImportId).get(),
      db.collection('knocks').where('campaignId', '==', campaignId).where('createdAt', '>=', createdAt).get(),
    ]);
    const knocked = new Set<string>();
    for (const k of knockSnap.docs) {
      const houseId = (k.data() as { houseId?: unknown }).houseId;
      if (typeof houseId === 'string') knocked.add(houseId);
    }
    const doors = doorSnap.docs.map((d) => ({ ...(d.data() as Partial<HouseDoc>), id: d.id }));
    const { removable, kept } = splitForRemove(doors, knocked);
    if (dryRun) return areaOk({ removable: removable.length, kept: kept.length });

    const removableIds = new Set(removable);
    const toDelete = doorSnap.docs.filter((d) => removableIds.has(d.id));
    const removed = await deleteDoors(db, toDelete);
    const keptCount = kept.length + (toDelete.length - removed);

    // A repeat call (already 'removed') leaves the first Remove's record as it is.
    if (area.status !== 'removed') {
      await ref.update({
        status: 'removed',
        removedAt: Date.now(),
        removedBy: gate.caller.uid,
        removedCount: removed,
        keptCount,
      });
    }
    return areaOk({ removed, kept: keptCount });
  } catch (error) {
    console.error('Knock area remove failed:', error);
    return areaError(500, 'internal');
  }
}
