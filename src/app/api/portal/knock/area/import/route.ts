import { NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  AREA_LABEL_MAX,
  areaImportDocs,
  areaPreviewCounts,
  type AreaPackCount,
  type AreaPreviewCounts,
  type LatLng,
} from '@/lib/knock/area/areaDraw';
import { TilesUnavailableError, type AreaSource } from '@/lib/knock/area/tiles';
import {
  AreaFailure,
  IMPORT_RETRY_AFTER_MS,
  areaCaller,
  areaDoorCount,
  areaError,
  areaOk,
  areaSummary,
  campaignAccess,
  grpcCode,
  parseAreaBody,
  planArea,
  readJsonObject,
  withoutUndefined,
  type AreaPlan,
  type ImportResponse,
} from '@/lib/knock/area/server';

// POST /api/portal/knock/area/import (3c-knock docs/AREA_IMPORT_API.md section 3).
// Body: { requestId, campaignId, polygon, housesOnly, ownerOccupiedOnly? (omitted = false), label? } (+ header
// Idempotency-Key: <requestId>; the body wins) -> 200 ImportResponse, the same body for every retry.
// The homes are always planned again here from the polygon; a client list is never trusted.
// Idempotent on areaImports/ai_<requestId>: done/removed replays the stored result, a live
// 'writing' attempt is 409 import_in_progress, a stale one (>= 120 s) is resumed.

export const maxDuration = 30;

const REQUEST_ID = /^[A-Za-z0-9_-]{1,128}$/;
const STALE_WRITE_MS = 120_000;

type Begin =
  | { kind: 'fresh' | 'resume'; record: Record<string, unknown>; previousStartedAt: number }
  | { kind: 'replay'; result: ImportResponse }
  | { kind: 'conflict' }
  | { kind: 'in_progress' };

function parseLabel(raw: unknown): { ok: true; label: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, label: null };
  if (typeof raw !== 'string') return { ok: false };
  const label = raw.trim();
  if (label.length < 1 || label.length > AREA_LABEL_MAX) return { ok: false };
  return { ok: true, label };
}

async function defaultLabel(db: Firestore, campaignId: string): Promise<string> {
  const snap = await db.collection('areaImports').where('campaignId', '==', campaignId).count().get();
  return `Area ${snap.data().count + 1}`;
}

/** The packs this campaign's area imports already made, plus the packs of its doors near the drawing. */
async function existingPacks(db: Firestore, campaignId: string, nearDoors: readonly { packId?: unknown; packName?: unknown }[]) {
  const snap = await db.collection('areaImports').where('campaignId', '==', campaignId).get();
  const out: { packId: string; packName: string }[] = [];
  for (const d of snap.docs) {
    const packs = (d.data() as { packs?: unknown }).packs;
    if (!Array.isArray(packs)) continue;
    for (const p of packs as Partial<AreaPackCount>[]) {
      if (typeof p?.packId === 'string' && typeof p?.name === 'string') out.push({ packId: p.packId, packName: p.name });
    }
  }
  for (const h of nearDoors) {
    if (typeof h.packId === 'string' && typeof h.packName === 'string') out.push({ packId: h.packId, packName: h.packName });
  }
  return out;
}

/** BulkWriter creates; a door that already exists (another import or a rep added it) is left as it is. */
async function createDoors(db: Firestore, houses: readonly ({ id: string } & Record<string, unknown>)[]): Promise<void> {
  if (houses.length === 0) return;
  const writer = db.bulkWriter();
  // ALREADY_EXISTS is final; anything else gets the SDK's usual retries.
  writer.onWriteError((error) => grpcCode(error) !== 6 && error.failedAttempts < 5);
  const failures: unknown[] = [];
  const writes = houses.map(({ id, ...doc }) =>
    writer.create(db.collection('houses').doc(id), withoutUndefined(doc)).then(
      () => undefined,
      (error: unknown) => {
        if (grpcCode(error) !== 6) failures.push(error);
      }
    )
  );
  await writer.close();
  await Promise.all(writes);
  if (failures.length > 0) throw failures[0];
}

export async function POST(request: NextRequest) {
  try {
    const gate = await areaCaller(request);
    if (!gate.ok) return gate.response;
    if (!adminDb) return areaError(500, 'internal', {}, 'Database not configured');
    const db = adminDb;
    const caller = gate.caller;

    const body = await readJsonObject(request);
    if (!body) return areaError(400, 'invalid_request');
    const requestId = body.requestId !== undefined ? body.requestId : request.headers.get('idempotency-key');
    if (typeof requestId !== 'string' || !REQUEST_ID.test(requestId)) return areaError(400, 'invalid_request');
    const parsed = parseAreaBody(body);
    if (!parsed.ok) return parsed.response;
    const label = parseLabel(body.label);
    if (!label.ok) return areaError(400, 'invalid_request');
    const { campaignId } = parsed;

    const access = await campaignAccess(db, caller, campaignId);
    if (!access.ok) return access.response;

    // 2. Idempotency.
    const areaImportId = `ai_${requestId}`;
    const ref = db.collection('areaImports').doc(areaImportId);
    const labelText = label.label ?? (await defaultLabel(db, campaignId));
    const begin = await db.runTransaction<Begin>(async (tx) => {
      const snap = await tx.get(ref);
      const now = Date.now();
      if (!snap.exists) {
        const record: Record<string, unknown> = {
          campaignId,
          requestId,
          label: labelText,
          polygon: parsed.polygon,
          housesOnly: parsed.housesOnly,
          ownerOccupiedOnly: parsed.ownerOccupiedOnly,
          status: 'writing',
          createdBy: caller.uid,
          createdByName: caller.name,
          createdAt: now,
          startedAt: now,
          finishedAt: null,
          doorCount: 0,
          counts: null,
          packs: [],
          sources: [],
          result: null,
          removedAt: null,
          removedBy: null,
          removedCount: null,
          keptCount: null,
        };
        tx.create(ref, record);
        return { kind: 'fresh', record, previousStartedAt: now };
      }
      const d = (snap.data() ?? {}) as Record<string, unknown>;
      if (d.createdBy !== caller.uid || d.campaignId !== campaignId) return { kind: 'conflict' };
      if (d.status === 'done' || d.status === 'removed') {
        return { kind: 'replay', result: { ...(d.result as ImportResponse), duplicate: true } };
      }
      const startedAt = typeof d.startedAt === 'number' ? d.startedAt : 0;
      if (now - startedAt < STALE_WRITE_MS) return { kind: 'in_progress' };
      tx.update(ref, { startedAt: now });
      return { kind: 'resume', record: { ...d, startedAt: now }, previousStartedAt: startedAt };
    });
    if (begin.kind === 'conflict') return areaError(409, 'request_id_conflict');
    if (begin.kind === 'in_progress') return areaError(409, 'import_in_progress', { retryAfterMs: IMPORT_RETRY_AFTER_MS });
    if (begin.kind === 'replay') return areaOk(begin.result);

    // A resume plans from the first attempt's polygon and switches (the first call wins).
    const record = begin.record;
    const resume = begin.kind === 'resume';
    const polygon = record.polygon as LatLng[];
    const switches = { housesOnly: record.housesOnly === true, ownerOccupiedOnly: record.ownerOccupiedOnly === true };

    // 3. Plan. Before any door is written a failure drops the 'writing' record (a retry starts
    // over); on a resume it puts startedAt back so the next retry resumes at once.
    let counts: AreaPreviewCounts;
    let packs: AreaPackCount[];
    let sources: AreaSource[];
    let houses: ({ id: string } & Record<string, unknown>)[];
    let plan: AreaPlan | null = null;
    try {
      plan = await planArea(db, campaignId, polygon);
      counts = areaPreviewCounts(plan.homes, switches);
      sources = plan.sources;
      const docs = areaImportDocs(plan.homes, switches, {
        campaignId,
        areaImportId,
        now: Date.now(),
        existingPacks: await existingPacks(db, campaignId, plan.existing),
      });
      packs = docs.packs;
      houses = docs.houses as unknown as ({ id: string } & Record<string, unknown>)[];
      if (houses.length === 0) throw new AreaFailure(422, 'nothing_to_add', { counts });
    } catch (error) {
      const written = resume ? await areaDoorCount(db, campaignId, areaImportId) : 0;
      if (written > 0 && error instanceof AreaFailure && error.code === 'nothing_to_add') {
        // An earlier attempt wrote every door: just finish.
        houses = [];
        counts = (error.extra.counts as AreaPreviewCounts) ?? { inside: 0, add: 0, skipRented: 0, skipType: 0, alreadyInCampaign: 0 };
        packs = [];
        sources = plan?.sources ?? [];
      } else {
        if (written > 0) await ref.update({ startedAt: begin.previousStartedAt });
        else await ref.delete();
        throw error;
      }
    }

    // 4. Write.
    await createDoors(db, houses);

    // 5. Finish.
    const added = await areaDoorCount(db, campaignId, areaImportId);
    const finishedAt = Date.now();
    const result: ImportResponse = {
      areaImportId,
      duplicate: false,
      added,
      counts,
      packs,
      area: areaSummary(areaImportId, record, added),
    };
    await ref.update(
      withoutUndefined({ status: 'done', finishedAt, doorCount: added, counts, packs, sources, result })
    );
    return areaOk(result);
  } catch (error) {
    if (error instanceof AreaFailure) return error.response();
    if (error instanceof TilesUnavailableError) {
      console.error('Knock area import: tiles unavailable:', error);
      return areaError(503, 'tiles_unavailable');
    }
    console.error('Knock area import failed:', error);
    return areaError(500, 'internal');
  }
}
