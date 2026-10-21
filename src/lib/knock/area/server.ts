import { NextResponse, type NextRequest } from 'next/server';
import type { Firestore } from 'firebase-admin/firestore';
import { requireVerifiedKnockCaller } from '@/lib/auth/requireVerifiedAdmin';
import {
  AREA_EXISTING_PAD_DEG,
  AREA_MAX_CELLS,
  AREA_MAX_HOMES,
  areaHomes,
  markInCampaign,
  polygonBox,
  validateAreaPolygon,
  type AreaHome,
  type AreaPackCount,
  type AreaPreviewCounts,
  type LatLng,
} from './areaDraw';
import { geohashesCoveringBox } from './geohash';
import { TILE_PRECISION } from './parcelTiles';
import { loadAreaTileRecords } from './tiles';
import type { House } from './types';

// Shared pieces of the knock area routes (/api/portal/knock/area/{preview,import,list,remove}),
// contract: 3c-knock docs/AREA_IMPORT_API.md. Every non-2xx body is { error: <code>, message?, ...extra }.

export type AreaErrorCode =
  | 'invalid_request'
  | 'invalid_polygon'
  | 'unauthenticated'
  | 'not_allowed'
  | 'campaign_not_found'
  | 'area_not_found'
  | 'request_id_conflict'
  | 'import_in_progress'
  | 'too_big'
  | 'no_data_for_area'
  | 'nothing_to_add'
  | 'tiles_unavailable'
  | 'internal';

export const IMPORT_RETRY_AFTER_MS = 2000;

export function areaError(status: number, error: AreaErrorCode, extra: Record<string, unknown> = {}, message?: string) {
  return NextResponse.json(
    { error, ...(message ? { message } : {}), ...extra },
    { status, headers: { 'Cache-Control': 'no-store' } }
  );
}

export function areaOk(body: unknown) {
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } });
}

/** A planning failure that maps to one contract error. */
export class AreaFailure extends Error {
  constructor(
    readonly status: number,
    readonly code: AreaErrorCode,
    readonly extra: Record<string, unknown> = {}
  ) {
    super(code);
    this.name = 'AreaFailure';
  }
  response() {
    return areaError(this.status, this.code, this.extra);
  }
}

/** `campaignId`, `polygon` and both switches of a preview or import body (400 invalid_request / invalid_polygon). */
export function parseAreaBody(
  body: Record<string, unknown>
):
  | { ok: true; campaignId: string; polygon: LatLng[]; housesOnly: boolean; ownerOccupiedOnly: boolean }
  | { ok: false; response: NextResponse } {
  const { campaignId, polygon, housesOnly, ownerOccupiedOnly } = body;
  if (!isDocId(campaignId) || !Array.isArray(polygon) || typeof housesOnly !== 'boolean' || typeof ownerOccupiedOnly !== 'boolean') {
    return { ok: false, response: areaError(400, 'invalid_request') };
  }
  const valid = validateAreaPolygon(polygon);
  if (!valid) return { ok: false, response: areaError(400, 'invalid_polygon') };
  return { ok: true, campaignId, polygon: valid, housesOnly, ownerOccupiedOnly };
}

export interface AreaCaller {
  uid: string;
  name: string;
  knockRole: 'owner' | 'manager' | 'rep';
  campaignIds: string[];
}

/** Step 1 of every route: a verified, switched-on caller (401 unauthenticated / 403 not_allowed). */
export async function areaCaller(request: NextRequest): Promise<{ ok: true; caller: AreaCaller } | { ok: false; response: NextResponse }> {
  const gate = await requireVerifiedKnockCaller(request);
  if (!gate.ok) {
    const code: AreaErrorCode = gate.status === 401 ? 'unauthenticated' : gate.status === 403 ? 'not_allowed' : 'internal';
    return { ok: false, response: areaError(gate.status === 401 || gate.status === 403 ? gate.status : 500, code, {}, gate.error) };
  }
  const { uid, name, knockRole, campaignIds } = gate;
  return { ok: true, caller: { uid, name, knockRole, campaignIds } };
}

/** The body of a POST as a plain object, or null (400 invalid_request). */
export async function readJsonObject(request: NextRequest): Promise<Record<string, unknown> | null> {
  const body = await request.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}

/** A Firestore document id we accept from a client: non-empty, at most 200 chars, no '/', not '.' or '..'. */
export function isDocId(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 && !v.includes('/') && v !== '.' && v !== '..' && !/^__.*__$/.test(v);
}

/**
 * Steps after the body check: 404 campaign_not_found, then 403 not_allowed. An owner may use any
 * campaign, a manager only one in their users/{uid}.campaignIds, a rep none.
 */
export async function campaignAccess(
  db: Firestore,
  caller: AreaCaller,
  campaignId: string
): Promise<{ ok: true; campaign: Record<string, unknown> } | { ok: false; response: NextResponse }> {
  const snap = await db.collection('campaigns').doc(campaignId).get();
  if (!snap.exists) return { ok: false, response: areaError(404, 'campaign_not_found') };
  const allowed = caller.knockRole === 'owner' || (caller.knockRole === 'manager' && caller.campaignIds.includes(campaignId));
  if (!allowed) return { ok: false, response: areaError(403, 'not_allowed') };
  return { ok: true, campaign: (snap.data() ?? {}) as Record<string, unknown> };
}

export interface AreaPlan {
  /** Every door inside the polygon, `inCampaign` set, sorted by id. */
  homes: AreaHome[];
  sources: { county: string; roll: string }[];
  /** The campaign's doors inside the polygon's box padded by AREA_EXISTING_PAD_DEG. */
  existing: House[];
}

async function existingDoorsNear(db: Firestore, campaignId: string, polygon: readonly LatLng[]): Promise<House[]> {
  const box = polygonBox(polygon);
  const minLat = box.minLat - AREA_EXISTING_PAD_DEG;
  const maxLat = box.maxLat + AREA_EXISTING_PAD_DEG;
  const minLng = box.minLng - AREA_EXISTING_PAD_DEG;
  const maxLng = box.maxLng + AREA_EXISTING_PAD_DEG;
  // Index: houses (campaignId ASC, lat ASC). lng is filtered here: one range field per query.
  const snap = await db
    .collection('houses')
    .where('campaignId', '==', campaignId)
    .where('lat', '>=', minLat)
    .where('lat', '<=', maxLat)
    .get();
  const out: House[] = [];
  for (const d of snap.docs) {
    const data = d.data() as Partial<House>;
    if (typeof data.lng !== 'number' || data.lng < minLng || data.lng > maxLng) continue;
    out.push({ ...(data as House), id: d.id });
  }
  return out;
}

/**
 * Section 1 "Finding the homes inside a polygon": the cells (422 too_big, inside null), the tiles
 * and the campaign's nearby doors in parallel (503 tiles_unavailable, 422 no_data_for_area), the
 * doors inside (422 too_big with the count), marked against the campaign. Throws AreaFailure.
 */
export async function planArea(db: Firestore, campaignId: string, polygon: readonly LatLng[]): Promise<AreaPlan> {
  const cells = geohashesCoveringBox(polygonBox(polygon), TILE_PRECISION, AREA_MAX_CELLS);
  if (!cells) throw new AreaFailure(422, 'too_big', { inside: null, max: AREA_MAX_HOMES });
  const [tiles, existing] = await Promise.all([loadAreaTileRecords(cells), existingDoorsNear(db, campaignId, polygon)]);
  if (!tiles.indexed) throw new AreaFailure(422, 'no_data_for_area');
  const inside = areaHomes(tiles.records, polygon, campaignId);
  if (inside.length > AREA_MAX_HOMES) throw new AreaFailure(422, 'too_big', { inside: inside.length, max: AREA_MAX_HOMES });
  return { homes: markInCampaign(inside, existing, campaignId), sources: tiles.sources, existing };
}

export interface AreaSummary {
  areaImportId: string;
  campaignId: string;
  label: string;
  doorCount: number;
  createdAt: number;
  createdBy: { uid: string; name: string };
  housesOnly: boolean;
  ownerOccupiedOnly: boolean;
  polygon: LatLng[];
}

export interface ImportResponse {
  areaImportId: string;
  duplicate: boolean;
  added: number;
  counts: AreaPreviewCounts;
  packs: AreaPackCount[];
  area: AreaSummary;
}

/** An areaImports doc as /list shows it, with a live door count. */
export function areaSummary(id: string, d: Record<string, unknown>, doorCount: number): AreaSummary {
  return {
    areaImportId: id,
    campaignId: String(d.campaignId ?? ''),
    label: String(d.label ?? ''),
    doorCount,
    createdAt: typeof d.createdAt === 'number' ? d.createdAt : 0,
    createdBy: { uid: String(d.createdBy ?? ''), name: String(d.createdByName ?? '') },
    housesOnly: d.housesOnly === true,
    ownerOccupiedOnly: d.ownerOccupiedOnly === true,
    polygon: Array.isArray(d.polygon) ? (d.polygon as LatLng[]) : [],
  };
}

/** Doors of the campaign with this areaImportId (equality only: no composite index). */
export async function areaDoorCount(db: Firestore, campaignId: string, areaImportId: string): Promise<number> {
  const snap = await db
    .collection('houses')
    .where('campaignId', '==', campaignId)
    .where('areaImportId', '==', areaImportId)
    .count()
    .get();
  return snap.data().count;
}

/** Firestore refuses `undefined` field values (ignoreUndefinedProperties is off): drop them, deeply. */
export function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) return value.map(withoutUndefined) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (v !== undefined) out[k] = withoutUndefined(v);
    return out as T;
  }
  return value;
}

/** gRPC status of a Firestore / BulkWriter error (6 ALREADY_EXISTS, 9 FAILED_PRECONDITION). */
export function grpcCode(error: unknown): number | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'number' ? code : undefined;
}
