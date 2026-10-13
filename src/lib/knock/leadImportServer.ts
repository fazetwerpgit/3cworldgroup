import type { Firestore } from 'firebase-admin/firestore';
import { planLeadImport, type LeadImportPlan } from './leadImport';
import type { House, HouseDoc } from './types';

// Server side of the owner's lead-list upload (Admin settings > Lead lists): reads the request,
// plans the import with the app's own planner (leadImport.ts, copied from 3c-knock-logic) against
// the houses already on the server, and writes the new doors. The client never sends a plan: both
// preview and import plan from the CSV text here, so what is written is always the server's plan.

export const HOUSES_COLLECTION = 'houses';
export const CAMPAIGNS_COLLECTION = 'campaigns';

/** Largest lead file (CSV text, UTF-8 bytes). The browser gzips it, so Vercel's 4.5 MB body cap still fits. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
/** Most data rows in one file. */
export const MAX_LEAD_ROWS = 20_000;
/** Houses per batched write (Firestore allows 500 writes per batch). */
export const WRITE_BATCH_SIZE = 450;
/** Doc refs per getAll when looking lead ids up in other campaigns. */
const LOOKUP_CHUNK = 300;
/** JSON framing around the CSV text (campaign id, rep, escaping headroom is in the CSV check). */
const MAX_BODY_BYTES = 2 * MAX_CSV_BYTES;

/**
 * Production kill-switch: the portal writes doors only when the server env says so. Preview
 * always runs. Set KNOCK_LEAD_IMPORT_LIVE=1 in Vercel once Jacob says imports may start.
 */
export function leadImportLive(): boolean {
  return process.env.KNOCK_LEAD_IMPORT_LIVE === '1';
}

export interface LeadImportInput {
  csvText: string;
  campaignId: string;
  /** A portal user's uid the doors go to; null = nobody yet. */
  assignTo: string | null;
}

export type LeadImportFailure = { ok: false; status: number; code: string; error: string };

function fail(status: number, code: string, error: string): LeadImportFailure {
  return { ok: false, status, code, error };
}

const TOO_BIG = fail(413, 'too-big', 'This file is over 10 MB. Split it into smaller files and upload each one.');

async function readLimited(stream: ReadableStream<Uint8Array>, limit: number): Promise<string | null> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function isId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/');
}

/**
 * The request body `{ csvText, campaignId, assignTo? }`: JSON, or the same JSON gzipped
 * (`Content-Type: application/gzip`, what the page sends). Size-capped while reading.
 */
export async function readLeadImportInput(
  request: Request
): Promise<{ ok: true; input: LeadImportInput } | LeadImportFailure> {
  if (Number(request.headers.get('content-length') ?? 0) > MAX_BODY_BYTES || !request.body) {
    return request.body ? TOO_BIG : fail(400, 'bad-request', 'Choose a lead file first.');
  }
  const gzipped = (request.headers.get('content-type') ?? '').startsWith('application/gzip');
  let text: string | null;
  try {
    const stream = gzipped ? request.body.pipeThrough(new DecompressionStream('gzip')) : request.body;
    text = await readLimited(stream, MAX_BODY_BYTES);
  } catch {
    return fail(400, 'bad-request', 'The file did not arrive in one piece. Try again.');
  }
  if (text === null) return TOO_BIG;

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return fail(400, 'bad-request', 'The file did not arrive in one piece. Try again.');
  }

  const { csvText, campaignId, assignTo } = body;
  if (typeof csvText !== 'string' || csvText.trim() === '') return fail(400, 'empty', 'This file has no rows.');
  if (Buffer.byteLength(csvText, 'utf8') > MAX_CSV_BYTES) return TOO_BIG;
  if (!isId(campaignId)) return fail(400, 'unknown-campaign', 'Pick a campaign.');
  if (assignTo !== undefined && assignTo !== null && assignTo !== '' && !isId(assignTo)) {
    return fail(400, 'unknown-rep', 'Pick the rep again.');
  }
  return { ok: true, input: { csvText, campaignId, assignTo: assignTo ? (assignTo as string) : null } };
}

export interface ServerLeadPlan {
  ok: true;
  plan: LeadImportPlan;
  campaign: { id: string; name: string };
  assignee: { uid: string; name: string } | null;
}

/**
 * Plans the import against the server: every door of the campaign, plus the leads' ids looked up
 * in other campaigns (a door there is never moved). Same steps as the app's previewLeadImport.
 */
export async function planLeadsOnServer(
  db: Firestore,
  input: LeadImportInput,
  now = Date.now()
): Promise<ServerLeadPlan | LeadImportFailure> {
  const campaignSnap = await db.collection(CAMPAIGNS_COLLECTION).doc(input.campaignId).get();
  if (!campaignSnap.exists) return fail(404, 'unknown-campaign', 'That campaign is not in 3C Doors. Pick it again.');
  const campaignName = String(campaignSnap.data()?.name ?? input.campaignId);

  let assignee: ServerLeadPlan['assignee'] = null;
  let assignTo: { repId: string; managerId: string | null } | null = null;
  if (input.assignTo) {
    const userSnap = await db.collection('users').doc(input.assignTo).get();
    const user = userSnap.data();
    if (!userSnap.exists || !user || user.status !== 'active') return fail(400, 'unknown-rep', 'Pick the rep again.');
    assignee = { uid: input.assignTo, name: String(user.displayName || user.email || input.assignTo) };
    assignTo = { repId: input.assignTo, managerId: typeof user.managerId === 'string' ? user.managerId : null };
  }

  const plan = (existing: readonly House[]) =>
    planLeadImport(input.csvText, { campaignId: input.campaignId, existing, assignTo, now });
  // Lead ids don't depend on existing doors: plan once without them to know which ids to look up.
  const draft = plan([]);
  if (!draft.ok) {
    return draft.reason === 'empty'
      ? fail(400, 'empty', 'This file has no rows.')
      : fail(400, 'unknown-format', "This isn't an AT&T or SalesRabbit lead file.");
  }
  if (draft.plan.rows > MAX_LEAD_ROWS) {
    return fail(
      413,
      'too-many-rows',
      `This file has ${draft.plan.rows.toLocaleString('en-US')} rows. The most at once is ${MAX_LEAD_ROWS.toLocaleString('en-US')}: split it into smaller files.`
    );
  }

  const houses = db.collection(HOUSES_COLLECTION);
  const existing = new Map<string, House>();
  const campaignHouses = await houses.where('campaignId', '==', input.campaignId).get();
  for (const doc of campaignHouses.docs) existing.set(doc.id, { id: doc.id, ...(doc.data() as HouseDoc) });
  const unknown = draft.plan.houses.map((h) => h.id).filter((id) => !existing.has(id));
  for (let i = 0; i < unknown.length; i += LOOKUP_CHUNK) {
    const snaps = await db.getAll(...unknown.slice(i, i + LOOKUP_CHUNK).map((id) => houses.doc(id)));
    for (const snap of snaps) {
      if (snap.exists) existing.set(snap.id, { id: snap.id, ...(snap.data() as HouseDoc) });
    }
  }

  const result = plan([...existing.values()]);
  if (!result.ok) return fail(400, result.reason, "This isn't an AT&T or SalesRabbit lead file.");
  return { ok: true, plan: result.plan, campaign: { id: input.campaignId, name: campaignName }, assignee };
}

/** What preview and import send back about a plan: counts only, never the doors themselves. */
export interface LeadPlanSummary {
  format: LeadImportPlan['format'];
  campaign: ServerLeadPlan['campaign'];
  assignee: ServerLeadPlan['assignee'];
  /** Data rows in the file. */
  rows: number;
  /** New doors the import adds. */
  doors: number;
  packs: LeadImportPlan['packs'];
  skipped: LeadImportPlan['skipped'];
  duplicates: number;
  mdus: number;
  units: number;
}

export function planSummary({ plan, campaign, assignee }: ServerLeadPlan): LeadPlanSummary {
  return {
    format: plan.format,
    campaign,
    assignee,
    rows: plan.rows,
    doors: plan.houses.length,
    packs: plan.packs,
    skipped: plan.skipped,
    duplicates: plan.duplicates,
    mdus: plan.mdus,
    units: plan.units,
  };
}

function isAlreadyExists(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  return e?.code === 6 || e?.code === 'already-exists' || /ALREADY_EXISTS/.test(String(e?.message ?? ''));
}

/**
 * Writes the planned houses, WRITE_BATCH_SIZE per batched write, with `create` so an existing door
 * is never overwritten: a batch that hits a door added since the plan writes the rest again
 * without it. Idempotent by house id. `onProgress` gets the houses handled so far.
 */
export async function writeLeadHouses(
  db: Firestore,
  houses: readonly House[],
  onProgress?: (handled: number) => void
): Promise<{ written: number; alreadyThere: number }> {
  const collection = db.collection(HOUSES_COLLECTION);
  let written = 0;
  let alreadyThere = 0;
  for (let i = 0; i < houses.length; i += WRITE_BATCH_SIZE) {
    let pending = houses.slice(i, i + WRITE_BATCH_SIZE);
    for (let attempt = 0; pending.length > 0; attempt++) {
      const batch = db.batch();
      for (const { id, ...doc } of pending) batch.create(collection.doc(id), doc);
      try {
        await batch.commit();
        written += pending.length;
        break;
      } catch (err) {
        if (!isAlreadyExists(err) || attempt >= 2) throw err;
        const snaps = await db.getAll(...pending.map((h) => collection.doc(h.id)));
        const missing = pending.filter((_, index) => !snaps[index].exists);
        alreadyThere += pending.length - missing.length;
        pending = missing;
      }
    }
    onProgress?.(Math.min(i + WRITE_BATCH_SIZE, houses.length));
  }
  return { written, alreadyThere };
}

/** One line of the import route's NDJSON response. */
export type LeadImportEvent =
  | { type: 'progress'; handled: number; total: number }
  | { type: 'done'; written: number; alreadyThere: number; summary: LeadPlanSummary }
  | { type: 'error'; error: string; handled: number };
