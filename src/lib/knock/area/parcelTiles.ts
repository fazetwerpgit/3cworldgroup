/**
 * Parcel tiles for the drawn-area import (docs/AREA_IMPORT_API.md "Tiles"): every home of a
 * county's tax roll, split by the geohash-5 cell of its point, one gzipped JSON file per cell:
 * `parcels/fl/<county>/<geohash5>.json.gz`. scripts/build-parcel-tiles.ts builds them from the FDOR
 * NAL file + parcel shapefile; the portal reads them to preview and import a drawn area.
 *
 * Pure (no Node, React Native or Firebase imports): the portal can copy this file with
 * geohash.ts, areaImport.ts and leadImport.ts.
 */
import { AREA_PROPERTY_TYPES, type AreaUseCode, type ParcelRow } from './areaImport';
import { geohashEncode } from './geohash';

/** Tile cell size: geohash-5 (0.0439° square, ~4.9 x 4.2 km in Florida). */
export const TILE_PRECISION = 5;
export const TILE_FORMAT_VERSION = 1;

/**
 * FDOR county numbers (`CO_NO`): the counties in alphabetical order from Alachua = 11, with
 * Miami-Dade filed under "Dade" (23) and the St. counties under "Saint". Keys are tile path slugs.
 */
export const FL_COUNTY_NUMBERS: Readonly<Record<string, string>> = Object.fromEntries(
  [
    'alachua', 'baker', 'bay', 'bradford', 'brevard', 'broward', 'calhoun', 'charlotte', 'citrus', 'clay',
    'collier', 'columbia', 'miami-dade', 'desoto', 'dixie', 'duval', 'escambia', 'flagler', 'franklin', 'gadsden',
    'gilchrist', 'glades', 'gulf', 'hamilton', 'hardee', 'hendry', 'hernando', 'highlands', 'hillsborough', 'holmes',
    'indian-river', 'jackson', 'jefferson', 'lafayette', 'lake', 'lee', 'leon', 'levy', 'liberty', 'madison',
    'manatee', 'marion', 'martin', 'monroe', 'nassau', 'okaloosa', 'okeechobee', 'orange', 'osceola', 'palm-beach',
    'pasco', 'pinellas', 'polk', 'putnam', 'st-johns', 'st-lucie', 'santa-rosa', 'sarasota', 'seminole', 'sumter',
    'suwannee', 'taylor', 'union', 'volusia', 'wakulla', 'walton', 'washington',
  ].map((slug, i) => [slug, String(11 + i)]),
);

/** A county name as a tile path slug: "St. Johns" -> "st-johns", "Miami-Dade" -> "miami-dade". */
export function countySlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/\bsaint\b/g, 'st')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function tilePath(state: string, county: string, geohash: string): string {
  return `parcels/${state}/${county}/${geohash}.json.gz`;
}
export function countyManifestPath(state: string, county: string): string {
  return `parcels/${state}/${county}/manifest.json`;
}
export function parcelIndexPath(state: string): string {
  return `parcels/${state}/index.json`;
}

/** One home in a tile. */
export interface ParcelTileRecord {
  /** `<CO_NO>-<PARCEL_ID>` ("26-1272000000R"): unique statewide. */
  id: string;
  /** Parcel polygon centroid, 6 decimals (WGS84 within ~1 m). */
  lat: number;
  lng: number;
  /** Physical address as on the roll, upper case, unit included ("1050 HENDRICKS AVE 101"). Starts with a digit. */
  address: string;
  /** Physical city as on the roll (upper case; '' when none). */
  city: string;
  /** Five-digit physical zip ('' when none). */
  zip: string;
  /** DOR use code: '001' single family, '002' mobile home, '004' condo, '008' multi-family 2-9 units. */
  use: AreaUseCode;
  /** Homestead exemption: the owner lives there. */
  homestead: boolean;
  /** First owner name as on the roll (`OWN_NAME`, upper case, spaces collapsed; '' when none). */
  owner: string;
}

export interface ParcelTile {
  v: typeof TILE_FORMAT_VERSION;
  state: string;
  county: string;
  /** FDOR county number, two digits ("26"). */
  countyNo: string;
  geohash: string;
  /** Tax roll the records come from ("2026F": final 2026 NAL). */
  roll: string;
  /** ISO time the tile was built. */
  builtAt: string;
  /** Sorted by `id`. */
  records: ParcelTileRecord[];
}

export interface CountyManifest {
  v: typeof TILE_FORMAT_VERSION;
  state: string;
  county: string;
  countyNo: string;
  roll: string;
  builtAt: string;
  /** Homes in all tiles. */
  homes: number;
  /** Records per tile, by geohash (sorted). */
  tiles: Record<string, number>;
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number } | null;
}

/** Which counties have a tile for each cell (a cell on a county line has two or more). */
export interface ParcelIndex {
  v: typeof TILE_FORMAT_VERSION;
  state: string;
  builtAt: string;
  counties: Record<string, { countyNo: string; roll: string; builtAt: string; homes: number; tiles: number }>;
  cells: Record<string, string[]>;
}

/** Why a roll row is not in any tile. */
export type TileSkipReason = 'not-home' | 'no-street-number' | 'no-coordinates' | 'repeated';

/** `OWN_NAME` as stored in a tile: trimmed, spaces collapsed. */
export function cleanOwnerName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ');
}

/**
 * One roll row as a tile record, or why it is left out: not a home use code, no street number
 * (the roll has only a road name), or no parcel polygon.
 */
export function tileRecordFromParcel(row: ParcelRow, ownerName: string): ParcelTileRecord | Exclude<TileSkipReason, 'repeated'> {
  if (!AREA_PROPERTY_TYPES[row.useCode]) return 'not-home';
  const address = row.address.trim().replace(/\s+/g, ' ');
  if (!/^\d/.test(address)) return 'no-street-number';
  if (row.lat === null || row.lng === null || !Number.isFinite(row.lat) || !Number.isFinite(row.lng)) return 'no-coordinates';
  return {
    id: row.parcelId,
    lat: Math.round(row.lat * 1e6) / 1e6,
    lng: Math.round(row.lng * 1e6) / 1e6,
    address,
    city: row.city.trim().replace(/\s+/g, ' '),
    zip: row.zip,
    use: row.useCode as AreaUseCode,
    homestead: row.homestead,
    owner: cleanOwnerName(ownerName),
  };
}

export interface CountyTileBuild {
  tiles: ParcelTile[];
  manifest: CountyManifest;
  rows: number;
  skipped: Record<TileSkipReason, number>;
  byUse: Record<AreaUseCode, number>;
  homestead: number;
  withOwner: number;
}

/** All tiles of one county from its roll rows (row + `OWN_NAME`). */
export function buildCountyTiles(
  rows: readonly { row: ParcelRow; owner: string }[],
  meta: { state: string; county: string; countyNo: string; roll: string; builtAt: string },
): CountyTileBuild {
  const skipped: Record<TileSkipReason, number> = { 'not-home': 0, 'no-street-number': 0, 'no-coordinates': 0, repeated: 0 };
  const byUse: Record<AreaUseCode, number> = { '001': 0, '002': 0, '004': 0, '008': 0 };
  const seen = new Set<string>();
  const cells = new Map<string, ParcelTileRecord[]>();
  let homestead = 0;
  let withOwner = 0;
  let bbox: CountyManifest['bbox'] = null;
  for (const { row, owner } of rows) {
    const rec = tileRecordFromParcel(row, owner);
    if (typeof rec === 'string') {
      skipped[rec]++;
      continue;
    }
    if (seen.has(rec.id)) {
      skipped.repeated++;
      continue;
    }
    seen.add(rec.id);
    byUse[rec.use]++;
    if (rec.homestead) homestead++;
    if (rec.owner) withOwner++;
    bbox = bbox
      ? { minLat: Math.min(bbox.minLat, rec.lat), minLng: Math.min(bbox.minLng, rec.lng), maxLat: Math.max(bbox.maxLat, rec.lat), maxLng: Math.max(bbox.maxLng, rec.lng) }
      : { minLat: rec.lat, minLng: rec.lng, maxLat: rec.lat, maxLng: rec.lng };
    const gh = geohashEncode(rec.lat, rec.lng, TILE_PRECISION);
    const cell = cells.get(gh);
    if (cell) cell.push(rec);
    else cells.set(gh, [rec]);
  }
  const tiles = [...cells.keys()].sort().map(
    (geohash): ParcelTile => ({
      v: TILE_FORMAT_VERSION,
      state: meta.state,
      county: meta.county,
      countyNo: meta.countyNo,
      geohash,
      roll: meta.roll,
      builtAt: meta.builtAt,
      records: (cells.get(geohash) as ParcelTileRecord[]).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    }),
  );
  return {
    tiles,
    manifest: {
      v: TILE_FORMAT_VERSION,
      ...meta,
      homes: seen.size,
      tiles: Object.fromEntries(tiles.map((t) => [t.geohash, t.records.length])),
      bbox,
    },
    rows: rows.length,
    skipped,
    byUse,
    homestead,
    withOwner,
  };
}

/** The statewide index from every county's manifest (counties sorted; each cell's counties sorted). */
export function mergeParcelIndex(state: string, manifests: readonly CountyManifest[], builtAt: string): ParcelIndex {
  const counties: ParcelIndex['counties'] = {};
  const cells = new Map<string, string[]>();
  for (const m of [...manifests].sort((a, b) => (a.county < b.county ? -1 : 1))) {
    if (m.state !== state) continue;
    counties[m.county] = { countyNo: m.countyNo, roll: m.roll, builtAt: m.builtAt, homes: m.homes, tiles: Object.keys(m.tiles).length };
    for (const gh of Object.keys(m.tiles)) {
      const list = cells.get(gh);
      if (list) list.push(m.county);
      else cells.set(gh, [m.county]);
    }
  }
  return {
    v: TILE_FORMAT_VERSION,
    state,
    builtAt,
    counties,
    cells: Object.fromEntries([...cells.keys()].sort().map((gh) => [gh, (cells.get(gh) as string[]).sort()])),
  };
}

const USE_CODES = new Set(Object.keys(AREA_PROPERTY_TYPES));

/**
 * A tile's JSON (after gunzip + JSON.parse), checked. Throws on a wrong version or shape; a
 * malformed record is dropped rather than failing the tile.
 */
export function parseParcelTile(json: unknown): ParcelTile {
  const t = json as Partial<ParcelTile> | null;
  if (!t || t.v !== TILE_FORMAT_VERSION || typeof t.geohash !== 'string' || typeof t.county !== 'string' || !Array.isArray(t.records)) {
    throw new Error('Not a parcel tile (v1)');
  }
  const records = (t.records as unknown[]).filter((r): r is ParcelTileRecord => {
    const x = r as Partial<ParcelTileRecord> | null;
    return (
      !!x &&
      typeof x.id === 'string' &&
      typeof x.lat === 'number' &&
      Number.isFinite(x.lat) &&
      typeof x.lng === 'number' &&
      Number.isFinite(x.lng) &&
      typeof x.address === 'string' &&
      typeof x.city === 'string' &&
      typeof x.zip === 'string' &&
      typeof x.use === 'string' &&
      USE_CODES.has(x.use) &&
      typeof x.homestead === 'boolean' &&
      typeof x.owner === 'string'
    );
  });
  return {
    v: TILE_FORMAT_VERSION,
    state: typeof t.state === 'string' ? t.state : '',
    county: t.county,
    countyNo: typeof t.countyNo === 'string' ? t.countyNo : '',
    geohash: t.geohash,
    roll: typeof t.roll === 'string' ? t.roll : '',
    builtAt: typeof t.builtAt === 'string' ? t.builtAt : '',
    records,
  };
}
