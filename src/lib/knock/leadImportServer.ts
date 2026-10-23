import type { Firestore } from 'firebase-admin/firestore';
import { geocodeAddresses } from './geocode';
import {
  leadGeocodeRequests,
  parseCsv,
  planLeadImport,
  type LeadImportPlan,
  type LeadPlanOptions,
  type LeadPoint,
  type LeadRep,
} from './leadImport';
import type { Disposition, House, HouseDoc } from './types';
import { isHiddenUser } from '@/lib/users/demoAccount';
import { DELETED_CAMPAIGN_ID } from '@/lib/solar/proofPins';

// Server side of the owner's lead-list upload (Admin settings > Lead lists): reads the request,
// plans the import with the app's own planner (leadImport.ts, copied from 3c-knock-logic) against
// the houses already on the server, and writes the new doors. The client never sends a plan: both
// preview and import plan from the CSV text here, so what is written is always the server's plan.
// Rows with only a street address are placed with the US Census geocoder (geocode.ts), from here:
// the Census sends no CORS headers, so the browser can't call it.

export const HOUSES_COLLECTION = 'houses';
export const CAMPAIGNS_COLLECTION = 'campaigns';

/** Largest lead file (CSV text, UTF-8 bytes). The browser gzips it, so Vercel's 4.5 MB body cap still fits. */
export const MAX_CSV_BYTES = 10 * 1024 * 1024;
/** Most data rows in one file. */
export const MAX_LEAD_ROWS = 20_000;
/** Houses per batched write (Firestore allows 500 writes per batch). */
export const WRITE_BATCH_SIZE = 450;
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
  /** A portal user's uid the doors go to, LEAD_ASSIGN_FROM_FILE, or null = nobody yet. */
  assignTo: string | null;
}

/** `assignTo` value: each door goes to the active user whose email is the row's "Assigned to (email)". */
export const LEAD_ASSIGN_FROM_FILE = 'file';

const UNKNOWN_FORMAT =
  "This isn't a lead file the portal can read. It needs Latitude and Longitude columns, or Address with City or ZIP. Save it as CSV.";

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
  /** The one person every door goes to; null for nobody or `fromFile`. */
  assignee: { uid: string; name: string } | null;
  /** Doors go to the people the file's "Assigned to (email)" names. */
  fromFile: boolean;
  /** `fromFile`: names of the users the file's emails matched, by uid. */
  names: Record<string, string>;
}

const nameOf = (uid: string, user: FirebaseFirestore.DocumentData) => String(user.displayName || user.email || uid);

/**
 * Plans the import against the campaign's doors on the server, the same three steps as the app's
 * previewLeadImport: the addresses to locate (`leadGeocodeRequests`), the Census geocoder
 * (`geocodeAddresses`), then `planLeadImport` with the campaign's results (Status column), `by`
 * (the importing owner: imported marks and notes) and who the doors go to. Lead ids are
 * campaign-scoped (`leadDocId`), so other campaigns never matter.
 */
export async function planLeadsOnServer(
  db: Firestore,
  input: LeadImportInput,
  opts: { by: string; now?: number }
): Promise<ServerLeadPlan | LeadImportFailure> {
  // Counted first so an oversized file is refused before any geocoding.
  const rows = parseCsv(input.csvText).length - 1;
  if (rows < 1) return fail(400, 'empty', 'This file has no rows.');
  if (rows > MAX_LEAD_ROWS) {
    return fail(
      413,
      'too-many-rows',
      `This file has ${rows.toLocaleString('en-US')} rows. The most at once is ${MAX_LEAD_ROWS.toLocaleString('en-US')}: split it into smaller files.`
    );
  }
  const located = leadGeocodeRequests(input.csvText);
  if (!located.ok) return fail(400, located.reason, located.reason === 'empty' ? 'This file has no rows.' : UNKNOWN_FORMAT);

  const campaignSnap = await db.collection(CAMPAIGNS_COLLECTION).doc(input.campaignId).get();
  if (!campaignSnap.exists) return fail(404, 'unknown-campaign', 'That campaign is not in 3C Doors. Pick it again.');
  const campaign = campaignSnap.data() ?? {};
  const dispositions = Array.isArray(campaign.dispositions) ? (campaign.dispositions as Disposition[]) : undefined;

  let assignee: ServerLeadPlan['assignee'] = null;
  let assignTo: LeadPlanOptions['assignTo'] = null;
  const names: Record<string, string> = {};
  const fromFile = input.assignTo === LEAD_ASSIGN_FROM_FILE;
  if (fromFile) {
    const users = await db.collection('users').where('status', '==', 'active').get();
    const reps: LeadRep[] = [];
    for (const doc of users.docs) {
      const user = doc.data();
      // Demo and test accounts never get doors from a file.
      if (isHiddenUser(user)) continue;
      if (typeof user.email !== 'string' || !user.email) continue;
      reps.push({ uid: doc.id, email: user.email, managerId: typeof user.managerId === 'string' ? user.managerId : null });
      names[doc.id] = nameOf(doc.id, user);
    }
    assignTo = { fromFile: reps };
  } else if (input.assignTo) {
    const userSnap = await db.collection('users').doc(input.assignTo).get();
    const user = userSnap.data();
    if (!userSnap.exists || !user || user.status !== 'active' || isHiddenUser(user)) {
      return fail(400, 'unknown-rep', 'Pick the rep again.');
    }
    assignee = { uid: input.assignTo, name: nameOf(input.assignTo, user) };
    assignTo = { repId: input.assignTo, managerId: typeof user.managerId === 'string' ? user.managerId : null };
  }

  let geocoded: Map<string, LeadPoint> | undefined;
  if (located.requests.length > 0) {
    const result = await geocodeAddresses(located.requests);
    if (!result.ok) {
      return fail(
        503,
        'geocoder-unavailable',
        "Couldn't look up the addresses on the map: the US Census address service didn't answer. Try again in a few minutes."
      );
    }
    geocoded = result.points;
  }

  // Soft-deleted doors of the campaign (campaignId '_deleted', `deleted.campaignId` = it; equality
  // on the nested field, no composite index) count as already there, so an import never adds one
  // again; restoring stays an app action. The planner (copied verbatim from the app) dedupes only
  // against doors of the campaign, so they go in as such, with no pack so packing ignores them.
  const [snap, deletedSnap] = await Promise.all([
    db.collection(HOUSES_COLLECTION).where('campaignId', '==', input.campaignId).get(),
    db.collection(HOUSES_COLLECTION).where('deleted.campaignId', '==', input.campaignId).get(),
  ]);
  const existing = snap.docs.map((doc): House => ({ id: doc.id, ...(doc.data() as HouseDoc) }));
  for (const doc of deletedSnap.docs) {
    const data = doc.data() as HouseDoc;
    if (data.campaignId !== DELETED_CAMPAIGN_ID) continue;
    existing.push({ id: doc.id, ...data, campaignId: input.campaignId, packId: '', packName: '' });
  }
  const result = planLeadImport(input.csvText, {
    campaignId: input.campaignId,
    existing,
    by: opts.by,
    dispositions,
    assignTo,
    geocoded,
    format: located.format,
    now: opts.now,
  });
  if (!result.ok) return fail(400, result.reason, result.reason === 'empty' ? 'This file has no rows.' : UNKNOWN_FORMAT);
  const usedNames = fromFile ? Object.fromEntries(result.plan.assignees.map((a) => [a.repId, names[a.repId]])) : {};
  return {
    ok: true,
    plan: result.plan,
    campaign: { id: input.campaignId, name: String(campaign.name ?? input.campaignId) },
    assignee,
    fromFile,
    names: usedNames,
  };
}

/** What preview and import send back about a plan: counts only, never the doors themselves. */
export interface LeadPlanSummary {
  format: LeadImportPlan['format'];
  campaign: ServerLeadPlan['campaign'];
  assignee: ServerLeadPlan['assignee'];
  fromFile: boolean;
  /** Data rows in the file. */
  rows: number;
  /** Where the rows went: houses, apartments in buildings (the rest are in `skipped`). */
  rowsBreakdown: LeadImportPlan['rowsBreakdown'];
  /** New doors the import adds. */
  doors: number;
  packs: LeadImportPlan['packs'];
  skipped: LeadImportPlan['skipped'];
  duplicates: number;
  mdus: number;
  units: number;
  /** Doors without a street address yet (the app fills it in on first open). */
  addressPending: number;
  geocoded: number;
  approximate: number;
  notLocated: number;
  statuses: LeadImportPlan['statuses'];
  unmatchedStatuses: LeadImportPlan['unmatchedStatuses'];
  /** `fromFile` only: who the file's emails matched (with their portal name), rows each. */
  assignees: { email: string; uid: string; name: string; count: number }[];
  unmatchedAssignees: LeadImportPlan['unmatchedAssignees'];
  fileAssignees: number;
  appointments: LeadImportPlan['appointments'];
  contacts: number;
  notes: number;
}

export function planSummary({ plan, campaign, assignee, fromFile, names }: ServerLeadPlan): LeadPlanSummary {
  return {
    format: plan.format,
    campaign,
    assignee,
    fromFile,
    rows: plan.rows,
    rowsBreakdown: plan.rowsBreakdown,
    doors: plan.houses.length,
    packs: plan.packs,
    skipped: plan.skipped,
    duplicates: plan.duplicates,
    mdus: plan.mdus,
    units: plan.units,
    addressPending: plan.houses.filter((h) => h.addressPending).length,
    geocoded: plan.geocoded,
    approximate: plan.approximate,
    notLocated: plan.notLocated,
    statuses: plan.statuses,
    unmatchedStatuses: plan.unmatchedStatuses,
    assignees: plan.assignees.map((a) => ({ email: a.email, uid: a.repId, name: names[a.repId] ?? a.email, count: a.count })),
    unmatchedAssignees: plan.unmatchedAssignees,
    fileAssignees: plan.fileAssignees,
    appointments: plan.appointments,
    contacts: plan.contacts,
    notes: plan.notes,
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
