// Firestore side of the leaderboard snapshot (snapshot.ts is the pure part).
//
// leaderboardSnapshots/meta            when it was built, dirty marker, lease,
//                                      months present, firstMonth, recent feed
// leaderboardSnapshots/{scope}__{id}   one period of one scope (JSON payload)
//
// Writers (sale create/edit/approve/cancel, carrier order writes, the report
// import) call markLeaderboardDirty(): one merge write, no read. A board read
// is meta + its period doc in one getAll. It rebuilds first when:
// - there is no usable snapshot (none yet, an old version, or another day:
//   rank history and the carrier buckets are day-based), or
// - it is dirty (or older than MAX_AGE) and the last build is at least
//   DEBOUNCE old — so a burst of sales costs one rebuild per 30 s, not one per
//   read, while the first sale after a quiet spell shows at once.
// A rebuild reads every sale (paged, no cap) and the cached carrier orders.
// The daily cron (/api/cron/leaderboard-snapshot) is the safety net.

import { FieldPath, type Firestore } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getAllFiberOrders } from '@/lib/fiberReport/ordersCache';
import type { BoardScope } from '@/lib/leaderboard/board';
import type { RecentSale } from '@/lib/leaderboard/team';
import type { KeyedCompanyTape } from '@/lib/sales/companyTapeStats';
import {
  SNAPSHOT_VERSION,
  buildBoardSnapshot,
  emptyPayload,
  periodFromSnapshot,
  snapshotValidKey,
  type BoardSnapshot,
  type PeriodPayload,
  type RawSale,
} from '@/lib/leaderboard/snapshot';

export const SNAPSHOT_COLLECTION = 'leaderboardSnapshots';
export const META_DOC = 'meta';
export const DEBOUNCE_MS = 30_000;
/** Backstop for writes no code path marks (a script, the console). */
export const MAX_AGE_MS = 60 * 60 * 1000;
const LEASE_MS = 60_000;
const SALES_PAGE = 1000;

export interface SnapshotMeta {
  version?: number;
  builtAtMs?: number;
  /** When the build that produced this snapshot started reading sales. */
  buildStartedMs?: number;
  validKey?: string;
  dirtyAtMs?: number;
  leaseUntilMs?: number;
  months?: string[];
  firstMonth?: Record<BoardScope, string | null>;
  recent?: string;
  demoRepIds?: string[];
  /** JSON KeyedCompanyTape for /api/portal/sales/company-stats (shaped per caller by tapeForViewer). */
  tape?: string;
}

export type SnapshotState = 'missing' | 'stale' | 'fresh';

/** Whether a stored snapshot can serve `now`, and whether it should be rebuilt. */
export function snapshotState(meta: SnapshotMeta | undefined, nowMs: number, validKey: string): SnapshotState {
  if (!meta || meta.version !== SNAPSHOT_VERSION || !meta.builtAtMs || meta.validKey !== validKey) return 'missing';
  const dirty = typeof meta.dirtyAtMs === 'number' && meta.dirtyAtMs >= (meta.buildStartedMs ?? meta.builtAtMs);
  if (dirty || nowMs - meta.builtAtMs > MAX_AGE_MS) return 'stale';
  return 'fresh';
}

/** Rebuild now? A missing snapshot always; a stale one once the debounce has passed. */
export function shouldRebuild(state: SnapshotState, meta: SnapshotMeta | undefined, nowMs: number): boolean {
  if (state === 'missing') return true;
  if (state === 'fresh') return false;
  return nowMs - (meta?.builtAtMs ?? 0) >= DEBOUNCE_MS;
}

export function periodDocId(scope: BoardScope, periodId: string): string {
  return `${scope}__${periodId}`;
}

function db(): Firestore {
  if (!adminDb) throw new Error('Database not configured');
  return adminDb;
}

/**
 * Mark the board stale after a write that can change it (a sale created,
 * edited, approved, cancelled or re-dated; a carrier order linked or
 * reassigned; a report imported). Never throws: the write already landed.
 */
export async function markLeaderboardDirty(nowMs: number = Date.now()): Promise<void> {
  if (!adminDb) return;
  try {
    await adminDb.collection(SNAPSHOT_COLLECTION).doc(META_DOC).set({ dirtyAtMs: nowMs }, { merge: true });
  } catch (error) {
    console.error('[leaderboard snapshot] failed to mark dirty', error);
  }
}

/** Every sale, paged in document-id order (the order an unordered read returns). */
export async function readAllSales(database: Firestore = db()): Promise<RawSale[]> {
  const rows: RawSale[] = [];
  let last: string | null = null;
  for (;;) {
    let query = database.collection('sales').orderBy(FieldPath.documentId()).limit(SALES_PAGE);
    if (last) query = query.startAfter(last);
    const page = await query.get();
    page.docs.forEach((doc) => rows.push({ id: doc.id, data: doc.data() as Record<string, unknown> }));
    if (page.docs.length < SALES_PAGE) break;
    last = page.docs[page.docs.length - 1].id;
  }
  return rows;
}

/** Build a snapshot from Firestore, for the shared board (viewerUid null) or a demo viewer. */
export async function computeSnapshotFromFirestore(now: Date, viewerUid: string | null = null): Promise<BoardSnapshot> {
  const database = db();
  const [sales, statusDoc] = await Promise.all([
    readAllSales(database),
    database.collection('config').doc('fiberReportStatus').get(),
  ]);
  const status = statusDoc.exists ? statusDoc.data() : undefined;
  const reportAsOf = typeof status?.lastReportAsOf === 'string' ? status.lastReportAsOf : null;
  let orders: Awaited<ReturnType<typeof getAllFiberOrders>> = [];
  try {
    orders = await getAllFiberOrders(status ?? null);
  } catch (carrierError) {
    // Fail-soft: without the report the board still ranks the portal's counts.
    console.error('Leaderboard carrier report failed:', carrierError);
  }
  return buildBoardSnapshot(sales, orders, { now, reportAsOf, viewerUid });
}

async function takeLease(nowMs: number): Promise<boolean> {
  const database = db();
  const ref = database.collection(SNAPSHOT_COLLECTION).doc(META_DOC);
  try {
    return await database.runTransaction(async (transaction) => {
      const meta = (await transaction.get(ref)).data() as SnapshotMeta | undefined;
      if ((meta?.leaseUntilMs ?? 0) > nowMs) return false;
      transaction.set(ref, { leaseUntilMs: nowMs + LEASE_MS }, { merge: true });
      return true;
    });
  } catch (error) {
    console.error('[leaderboard snapshot] lease failed', error);
    return true;
  }
}

/** Rebuild and store the shared snapshot. Returns it, so the caller can serve it at once. */
export async function rebuildLeaderboardSnapshot(now: Date = new Date()): Promise<BoardSnapshot> {
  const database = db();
  // The request clock (`now` is the caller's new Date()), so tests can drive it.
  const buildStartedMs = now.getTime();
  const snapshot = await computeSnapshotFromFirestore(now, null);
  const collection = database.collection(SNAPSHOT_COLLECTION);

  const entries = Object.entries(snapshot.periods);
  // Period docs first (chunked under the 500-write batch cap), meta last: a
  // reader that sees the new meta finds every doc it names.
  for (let offset = 0; offset < entries.length; offset += 400) {
    const batch = database.batch();
    for (const [key, payload] of entries.slice(offset, offset + 400)) {
      const [scope, periodId] = key.split(':') as [BoardScope, string];
      batch.set(collection.doc(periodDocId(scope, periodId)), {
        version: SNAPSHOT_VERSION,
        builtAtMs: snapshot.builtAtMs,
        payload: JSON.stringify(payload),
      });
    }
    await batch.commit();
  }
  const meta: SnapshotMeta = {
    version: SNAPSHOT_VERSION,
    builtAtMs: snapshot.builtAtMs,
    buildStartedMs,
    validKey: snapshot.validKey,
    leaseUntilMs: 0,
    months: snapshot.months,
    firstMonth: snapshot.firstMonth,
    recent: JSON.stringify(snapshot.recent),
    demoRepIds: snapshot.demoRepIds,
    tape: JSON.stringify(snapshot.tape),
  };
  await collection.doc(META_DOC).set(meta, { merge: true });
  return snapshot;
}

export interface BoardPeriodRequest {
  now: Date;
  viewerUid: string;
  scope: BoardScope;
  /** week | year | all | month-YYYY-MM */
  periodId: string;
  /** The route's own bounds for the period (used for an empty payload). */
  start: Date;
  end: Date | null;
  withHistory: boolean;
}

export interface BoardPeriodResult {
  payload: PeriodPayload;
  firstMonth: Record<BoardScope, string | null>;
  recent: RecentSale[];
  source: 'snapshot' | 'rebuilt' | 'live';
}

function fromSnapshot(snapshot: BoardSnapshot, req: BoardPeriodRequest, source: BoardPeriodResult['source']): BoardPeriodResult {
  return { ...periodFromSnapshot(snapshot, req), source };
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/** How long a request that lost the lease on a MISSING snapshot waits for the holder's build. */
export const MISSING_WAIT_MS = 8_000;
const MISSING_POLL_MS = 400;

/**
 * What a due rebuild gave the caller: a snapshot it built (or a live build, for
 * a missing snapshot nobody else finished in time), or 'stored' — read the
 * stored docs (they are fresh enough, or another instance just wrote them).
 */
type RebuildOutcome = { snapshot: BoardSnapshot; source: 'rebuilt' | 'live' } | 'stored';

/**
 * One rebuild per server instance at a time: concurrent requests here share it.
 * Keyed by whether the snapshot was missing, so a missing-snapshot caller never
 * joins a stale caller's "serve the stored one" answer.
 */
const pendingRebuild = new Map<'missing' | 'stale', Promise<RebuildOutcome>>();

/** Tests: forget an in-flight rebuild and the demo viewers' cached boards. */
export function resetSnapshotRebuildForTests() {
  pendingRebuild.clear();
  demoBuilds.clear();
}

/**
 * A demo viewer's own board (shared sales plus its demo sales) costs a full
 * sales read, so it is cached per viewer on this instance and rebuilt by the
 * shared snapshot's rule: when the day changes, or when a write marked the
 * board dirty (or it is older than MAX_AGE) and the last build is at least
 * DEBOUNCE old. Concurrent requests share the one build.
 */
interface DemoBuild {
  startedMs: number;
  validKey: string;
  promise: Promise<BoardSnapshot>;
}
const demoBuilds = new Map<string, DemoBuild>();
/** Demo accounts are a handful; this only bounds a pathological list. */
const DEMO_CACHE_MAX = 50;

function demoSnapshot(now: Date, viewerUid: string, meta: SnapshotMeta | undefined): Promise<BoardSnapshot> {
  const nowMs = now.getTime();
  const validKey = snapshotValidKey(now);
  const cached = demoBuilds.get(viewerUid);
  if (cached) {
    const cachedMeta: SnapshotMeta = {
      version: SNAPSHOT_VERSION,
      builtAtMs: cached.startedMs,
      buildStartedMs: cached.startedMs,
      validKey: cached.validKey,
      dirtyAtMs: meta?.dirtyAtMs,
    };
    const state = snapshotState(cachedMeta, nowMs, validKey);
    if (!shouldRebuild(state, cachedMeta, nowMs)) return cached.promise;
  }
  if (!demoBuilds.has(viewerUid) && demoBuilds.size >= DEMO_CACHE_MAX) demoBuilds.clear();
  const promise = computeSnapshotFromFirestore(now, viewerUid);
  const entry: DemoBuild = { startedMs: nowMs, validKey, promise };
  demoBuilds.set(viewerUid, entry);
  // A failed build is not cached: the next request tries again.
  promise.catch(() => {
    if (demoBuilds.get(viewerUid) === entry) demoBuilds.delete(viewerUid);
  });
  return promise;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readMeta(): Promise<SnapshotMeta | undefined> {
  const doc = await db().collection(SNAPSHOT_COLLECTION).doc(META_DOC).get();
  return doc.exists ? (doc.data() as SnapshotMeta) : undefined;
}

/**
 * The due rebuild, behind the lease whether the snapshot is stale or missing,
 * so a burst of requests (across instances) costs ONE full sales read:
 * - won the lease: rebuild and store;
 * - lost it, stale: serve the stored snapshot while the holder builds;
 * - lost it, missing (nothing stored to serve): wait for the holder's build,
 *   then read it; if it has not landed within MISSING_WAIT_MS (the holder died
 *   or is slow), build once live for this instance, unstored, so a first-ever
 *   request still gets a board, never an error.
 * Inside one instance, concurrent callers share the same promise.
 */
function rebuildWhenDue(now: Date, state: SnapshotState): Promise<RebuildOutcome> {
  const key = state === 'missing' ? 'missing' : 'stale';
  const inFlight = pendingRebuild.get(key);
  if (inFlight) return inFlight;
  const run = (async (): Promise<RebuildOutcome> => {
    const nowMs = now.getTime();
    if (await takeLease(nowMs)) return { snapshot: await rebuildLeaderboardSnapshot(now), source: 'rebuilt' };
    if (state !== 'missing') return 'stored';
    const validKey = snapshotValidKey(now);
    for (let waited = 0; waited < MISSING_WAIT_MS; waited += MISSING_POLL_MS) {
      await sleep(MISSING_POLL_MS);
      if (snapshotState(await readMeta(), nowMs, validKey) !== 'missing') return 'stored';
    }
    return { snapshot: await computeSnapshotFromFirestore(now, null), source: 'live' };
  })().finally(() => {
    if (pendingRebuild.get(key) === run) pendingRebuild.delete(key);
  });
  pendingRebuild.set(key, run);
  return run;
}

/**
 * The due rebuild for a board or tape read. A stale snapshot is still usable,
 * so a failed rebuild (a sales page timeout, a batch commit) serves it rather
 * than failing the request; the lease the failed build took stays held until
 * it expires, which keeps other requests from retrying the full read at once.
 * With nothing stored (missing), the error goes to the caller.
 */
async function rebuildOrServeStored(now: Date, state: SnapshotState): Promise<RebuildOutcome> {
  try {
    return await rebuildWhenDue(now, state);
  } catch (error) {
    if (state === 'missing') throw error;
    console.error('[leaderboard snapshot] rebuild failed; serving the stored snapshot', error);
    return 'stored';
  }
}

/** One period of the board: from the stored snapshot, rebuilt first when due. */
export async function loadBoardPeriod(req: BoardPeriodRequest): Promise<BoardPeriodResult> {
  const database = db();
  const nowMs = req.now.getTime();
  const validKey = snapshotValidKey(req.now);
  const collection = database.collection(SNAPSHOT_COLLECTION);
  const readDocs = () => database.getAll(collection.doc(META_DOC), collection.doc(periodDocId(req.scope, req.periodId)));
  let [metaDoc, periodDoc] = await readDocs();
  let meta = metaDoc.exists ? (metaDoc.data() as SnapshotMeta) : undefined;

  // A demo account sees its own demo sales on its board: built live for it alone.
  if (meta?.demoRepIds?.includes(req.viewerUid)) {
    return fromSnapshot(await demoSnapshot(req.now, req.viewerUid, meta), req, 'live');
  }

  const state = snapshotState(meta, nowMs, validKey);
  if (shouldRebuild(state, meta, nowMs)) {
    const outcome = await rebuildOrServeStored(req.now, state);
    if (outcome !== 'stored') {
      if (outcome.snapshot.demoRepIds.includes(req.viewerUid)) {
        return fromSnapshot(await demoSnapshot(req.now, req.viewerUid, meta), req, 'live');
      }
      return fromSnapshot(outcome.snapshot, req, outcome.source);
    }
    if (state === 'missing') {
      // Another instance's build landed while we waited: read what it stored.
      [metaDoc, periodDoc] = await readDocs();
      meta = metaDoc.exists ? (metaDoc.data() as SnapshotMeta) : undefined;
    }
  }

  const monthId = req.periodId.startsWith('month-') ? req.periodId.slice('month-'.length) : null;
  const listed = monthId === null || (meta?.months ?? []).includes(monthId);
  const stored = listed && periodDoc.exists ? parseJson<PeriodPayload | null>(periodDoc.data()?.payload, null) : null;
  return {
    payload: stored ?? emptyPayload(req.start, req.end, req.withHistory),
    firstMonth: meta?.firstMonth ?? { approved: null, submitted: null },
    recent: parseJson<RecentSale[]>(meta?.recent, []),
    source: 'snapshot',
  };
}

/**
 * The All Company tape, from the same snapshot (one doc read). Rebuilt first
 * when due, exactly like a board read; a demo account's tape is built live.
 */
export async function loadCompanyTape(now: Date, viewerUid: string): Promise<KeyedCompanyTape> {
  const nowMs = now.getTime();
  let meta = await readMeta();
  if (meta?.demoRepIds?.includes(viewerUid)) {
    return (await demoSnapshot(now, viewerUid, meta)).tape;
  }
  let stored = parseJson<KeyedCompanyTape | null>(meta?.tape, null);
  // A meta with no tape (written before the tape existed) counts as missing.
  const state = stored ? snapshotState(meta, nowMs, snapshotValidKey(now)) : 'missing';
  if (shouldRebuild(state, meta, nowMs)) {
    const outcome = await rebuildOrServeStored(now, state);
    if (outcome !== 'stored') {
      if (outcome.snapshot.demoRepIds.includes(viewerUid)) return (await demoSnapshot(now, viewerUid, meta)).tape;
      return outcome.snapshot.tape;
    }
    if (!stored) {
      meta = await readMeta();
      stored = parseJson<KeyedCompanyTape | null>(meta?.tape, null);
    }
  }
  if (stored) return stored;
  // Waited, and the stored meta still has no tape: build it once live.
  return (await computeSnapshotFromFirestore(now, null)).tape;
}
