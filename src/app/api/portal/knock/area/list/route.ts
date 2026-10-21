import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  areaCaller,
  areaDoorCount,
  areaError,
  areaOk,
  areaSummary,
  campaignAccess,
  isDocId,
} from '@/lib/knock/area/server';

// GET /api/portal/knock/area/list?campaignId=<id> (3c-knock docs/AREA_IMPORT_API.md section 4)
// -> 200 { areas: AreaSummary[] }: status 'done' only, newest first, doorCount live (count()).
// Index: areaImports (campaignId ASC, createdAt DESC).
export async function GET(request: NextRequest) {
  try {
    const gate = await areaCaller(request);
    if (!gate.ok) return gate.response;
    if (!adminDb) return areaError(500, 'internal', {}, 'Database not configured');
    const db = adminDb;

    const campaignId = request.nextUrl.searchParams.get('campaignId');
    if (!isDocId(campaignId)) return areaError(400, 'invalid_request');

    const access = await campaignAccess(db, gate.caller, campaignId);
    if (!access.ok) return access.response;

    const snap = await db
      .collection('areaImports')
      .where('campaignId', '==', campaignId)
      .orderBy('createdAt', 'desc')
      .limit(200)
      .get();
    const done = snap.docs
      .map((d) => ({ id: d.id, data: (d.data() ?? {}) as Record<string, unknown> }))
      .filter(({ data }) => data.status === 'done');
    const counts = await Promise.all(done.map(({ id }) => areaDoorCount(db, campaignId, id)));
    return areaOk({ areas: done.map(({ id, data }, i) => areaSummary(id, data, counts[i])) });
  } catch (error) {
    console.error('Knock area list failed:', error);
    return areaError(500, 'internal');
  }
}
