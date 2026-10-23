import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { AREA_MAX_HOMES, areaHomeStatus, areaPreviewCounts } from '@/lib/knock/area/areaDraw';
import { TilesUnavailableError } from '@/lib/knock/area/tiles';
import {
  AreaFailure,
  areaCaller,
  areaError,
  areaOk,
  campaignAccess,
  parseAreaBody,
  planArea,
  readJsonObject,
} from '@/lib/knock/area/server';

// A dense area (Chicago) can read several large tiles; the target stays ~1.5 s, this is the ceiling.
export const maxDuration = 30;

// POST /api/portal/knock/area/preview (3c-knock docs/AREA_IMPORT_API.md section 2).
// Body: { campaignId, polygon: LatLng[], housesOnly, ownerOccupiedOnly? (omitted = false) }
// -> 200 { campaignId, counts, homes: PreviewHome[], sources, maxHomes }. Writes nothing.
// sources[i].ownerOccupied: 'exemption' | 'mailing-match' | 'none' (resolved; Florida = 'exemption').
// 'none' = no owner-occupied signal: those homes carry ownerOccupiedUnknown: true and Owner-occupied
// only does not skip them, so the app can hide or disable the switch.
// Owner (admin/owner): any campaign; manager: their campaignIds; reps: 403 not_allowed.
export async function POST(request: NextRequest) {
  try {
    const gate = await areaCaller(request);
    if (!gate.ok) return gate.response;
    if (!adminDb) return areaError(500, 'internal', {}, 'Database not configured');
    const db = adminDb;

    const body = await readJsonObject(request);
    if (!body) return areaError(400, 'invalid_request');
    const parsed = parseAreaBody(body);
    if (!parsed.ok) return parsed.response;
    const { campaignId, polygon } = parsed;
    const switches = { housesOnly: parsed.housesOnly, ownerOccupiedOnly: parsed.ownerOccupiedOnly };

    const access = await campaignAccess(db, gate.caller, campaignId);
    if (!access.ok) return access.response;

    const plan = await planArea(db, campaignId, polygon);
    const homes = plan.homes.map((h) => ({
      id: h.id,
      lat: h.lat,
      lng: h.lng,
      address: h.address,
      city: h.city,
      zip: h.zip,
      ownerName: h.ownerName,
      unitOrder: h.unitOrder,
      unitOwnerNames: h.unitOwnerNames,
      homestead: h.homestead,
      // Additive: only on doors whose county has no owner-occupied signal (sources[].ownerOccupied 'none').
      ...(h.ownerOccupiedUnknown ? { ownerOccupiedUnknown: true } : {}),
      useType: h.useType,
      propertyType: h.propertyType,
      inCampaign: h.inCampaign,
      // Additive: the matching door is soft-deleted from this campaign (status stays already-in-campaign).
      ...(h.deleted ? { deleted: true } : {}),
      status: areaHomeStatus(h, switches),
    }));
    return areaOk({
      campaignId,
      counts: areaPreviewCounts(plan.homes, switches),
      homes,
      sources: plan.sources,
      maxHomes: AREA_MAX_HOMES,
    });
  } catch (error) {
    if (error instanceof AreaFailure) return error.response();
    if (error instanceof TilesUnavailableError) {
      console.error('Knock area preview: tiles unavailable:', error);
      return areaError(503, 'tiles_unavailable');
    }
    console.error('Knock area preview failed:', error);
    return areaError(500, 'internal');
  }
}
