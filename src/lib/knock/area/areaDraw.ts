/**
 * Drawn-area import (docs/AREA_IMPORT_API.md): an owner or manager draws a free-hand polygon; the
 * portal reads the parcel tiles under it (parcelTiles.ts) and previews, imports and removes doors.
 * This file is the shared logic: polygon checks, which tile records are inside, grouping into doors
 * (one per parcel, condo units of one building = one MDU door, as planAreaImport), the preview
 * classification (add / skip-rented / skip-type / already-in-campaign), the door documents an
 * import writes, and which doors Remove may delete.
 *
 * Pure (no Node, React Native or Firebase imports). The portal copies it with areaImport.ts,
 * leadImport.ts, parcelTiles.ts, geohash.ts and the types it uses; the app uses
 * `areaHomeStatus` / `areaPreviewCounts` to flip the preview switches without a new request.
 */
import { AREA_PROPERTY_TYPES, areaDoorId, packAreaHouses, splitCondoUnit, type AreaUseCode } from './areaImport';
import type { GeoBox } from './geohash';
import { dedupeLeads, leadHouseDoc, normalizeAddress, titleCase, type LeadHouse } from '@/lib/knock/leadImport';
import type { ParcelTileRecord } from './parcelTiles';
import type { House, HouseDoc, PropertyType } from './types';

/** Most doors one drawing may hold (inside the polygon, every status). Over it: too_big. */
export const AREA_MAX_HOMES = 2000;
/** Polygon vertices accepted (the app simplifies a finger path to fewer). */
export const AREA_MAX_POLYGON_POINTS = 1000;
/** Most geohash-5 tile cells a polygon's bounding box may cover (16 ≈ 330 km²). Over it: too_big before reading tiles. */
export const AREA_MAX_CELLS = 16;
/** Padding (degrees, ~500 m) around the polygon's box when reading the campaign's doors for duplicates. */
export const AREA_EXISTING_PAD_DEG = 0.005;
export const AREA_LABEL_MAX = 60;

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * A request's `polygon`, checked: 3 to AREA_MAX_POLYGON_POINTS `{ lat, lng }` with finite
 * coordinates in range, and a non-zero area. A closing point equal to the first is dropped.
 * Null when invalid.
 */
export function validateAreaPolygon(raw: unknown): LatLng[] | null {
  if (!Array.isArray(raw)) return null;
  const points: LatLng[] = [];
  for (const p of raw as unknown[]) {
    const q = p as Partial<LatLng> | null;
    if (!q || typeof q.lat !== 'number' || typeof q.lng !== 'number') return null;
    if (!Number.isFinite(q.lat) || !Number.isFinite(q.lng) || Math.abs(q.lat) > 90 || Math.abs(q.lng) > 180) return null;
    points.push({ lat: q.lat, lng: q.lng });
  }
  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    if (first.lat === last.lat && first.lng === last.lng) points.pop();
  }
  if (points.length < 3 || points.length > AREA_MAX_POLYGON_POINTS) return null;
  let area2 = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i];
    const b = points[(i + 1) % points.length];
    area2 += (a.lng - points[0].lng) * (b.lat - points[0].lat) - (b.lng - points[0].lng) * (a.lat - points[0].lat);
  }
  return Math.abs(area2) > 1e-14 ? points : null;
}

export function polygonBox(polygon: readonly LatLng[]): GeoBox {
  let minLat = Infinity;
  let minLng = Infinity;
  let maxLat = -Infinity;
  let maxLng = -Infinity;
  for (const p of polygon) {
    minLat = Math.min(minLat, p.lat);
    maxLat = Math.max(maxLat, p.lat);
    minLng = Math.min(minLng, p.lng);
    maxLng = Math.max(maxLng, p.lng);
  }
  return { minLat, minLng, maxLat, maxLng };
}

/**
 * Point in polygon by non-zero winding: the same rule as the app's lasso (turf.ts `pointInPolygon`),
 * so a self-crossing finger loop selects the same doors here as on the phone.
 */
export function pointInPolygon(p: LatLng, polygon: readonly LatLng[]): boolean {
  const n = polygon.length;
  if (n < 3) return false;
  let winding = 0;
  for (let i = 0; i < n; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % n];
    const side = (b.lng - a.lng) * (p.lat - a.lat) - (p.lng - a.lng) * (b.lat - a.lat);
    if (a.lat <= p.lat) {
      if (b.lat > p.lat && side > 0) winding += 1;
    } else if (b.lat <= p.lat && side < 0) {
      winding -= 1;
    }
  }
  return winding !== 0;
}

const KEEP_UPPER = new Set(['LLC', 'LLP', 'LP', 'INC', 'PA', 'PLLC', 'II', 'III', 'IV', 'USA', 'N', 'S', 'E', 'W']);

/** A roll owner name for display: "SMITH JOHN A & SMITH JANE" -> "Smith John A & Smith Jane"; "ABC HOMES LLC" -> "Abc Homes LLC". '' -> null. */
export function formatOwnerName(raw: string): string | null {
  const words = raw.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  return words.map((w) => (KEEP_UPPER.has(w.toUpperCase()) ? w.toUpperCase() : titleCase(w))).join(' ');
}

/** One door a drawing would add (or skips), before the campaign's switches. */
export interface AreaHome {
  /** Firestore door id (campaign-scoped, `areaDoorId`). */
  id: string;
  /** Tile record ids behind the door (one; a condo building: its units). */
  parcelIds: string[];
  lat: number;
  lng: number;
  /** Display case ("1050 Hendricks Ave"; a condo building without its unit). */
  address: string;
  city: string;
  zip: string;
  useType: AreaUseCode;
  propertyType: PropertyType;
  /** Owner lives there (a condo building: more than half of its units). */
  homestead: boolean;
  /** Display-case owner name; null for a condo building (see `unitOwnerNames`) or none on the roll. */
  ownerName: string | null;
  /** Condo building: unit labels in natural order; null otherwise. */
  unitOrder: string[] | null;
  /** Condo building: owner name per unit (units without a name left out); null otherwise. */
  unitOwnerNames: Record<string, string> | null;
  /** Already a door of the campaign (`dedupeLeads`: same id, same address, or within 4 m). */
  inCampaign: boolean;
}

const naturalCompare = new Intl.Collator('en', { numeric: true }).compare;

/**
 * The doors inside `polygon` from tile records (any number of tiles; a record repeated is used
 * once). Records are taken in id order, so the result does not depend on tile order. Grouping as
 * `planAreaImport`: one door per parcel; condo units (`004`) of one building (same zip + street
 * address before the unit) are one MDU door at their mean position, a lone unit a plain door; a
 * second parcel at the same address is dropped. Sorted by id. `inCampaign` is false (see `markInCampaign`).
 */
export function areaHomes(records: readonly ParcelTileRecord[], polygon: readonly LatLng[], campaignId: string): AreaHome[] {
  const byId = new Map<string, ParcelTileRecord>();
  for (const r of records) if (!byId.has(r.id) && AREA_PROPERTY_TYPES[r.use] && pointInPolygon(r, polygon)) byId.set(r.id, r);
  const inside = [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  const plain = (r: ParcelTileRecord): AreaHome => ({
    id: areaDoorId(campaignId, r.id),
    parcelIds: [r.id],
    lat: r.lat,
    lng: r.lng,
    address: titleCase(r.address),
    city: titleCase(r.city),
    zip: r.zip,
    useType: r.use,
    propertyType: AREA_PROPERTY_TYPES[r.use],
    homestead: r.homestead,
    ownerName: formatOwnerName(r.owner),
    unitOrder: null,
    unitOwnerNames: null,
    inCampaign: false,
  });

  const seenAddresses = new Set<string>();
  const out: AreaHome[] = [];
  const buildings = new Map<string, { building: string; rows: { unit: string; r: ParcelTileRecord }[] }>();
  const addPlain = (r: ParcelTileRecord) => {
    const key = normalizeAddress(r.address, r.city);
    if (seenAddresses.has(key)) return;
    seenAddresses.add(key);
    out.push(plain(r));
  };
  for (const r of inside) {
    const split = r.use === '004' ? splitCondoUnit(r.address) : null;
    if (!split) {
      addPlain(r);
      continue;
    }
    const key = `${r.zip}|${normalizeAddress(split.building, r.city)}`;
    const b = buildings.get(key);
    if (!b) buildings.set(key, { building: split.building, rows: [{ unit: split.unit, r }] });
    else if (!b.rows.some((u) => u.unit === split.unit)) b.rows.push({ unit: split.unit, r });
  }
  for (const { building, rows } of buildings.values()) {
    if (rows.length === 1) {
      addPlain(rows[0].r);
      continue;
    }
    const units = [...rows].sort((a, b) => naturalCompare(a.unit, b.unit));
    const lowest = rows.map((u) => u.r.id).sort(naturalCompare)[0];
    const owners: Record<string, string> = {};
    for (const { unit, r } of units) {
      const name = formatOwnerName(r.owner);
      if (name) owners[unit] = name;
    }
    const first = units[0].r;
    out.push({
      id: areaDoorId(campaignId, lowest, true),
      parcelIds: units.map((u) => u.r.id),
      lat: Math.round((units.reduce((s, u) => s + u.r.lat, 0) / units.length) * 1e6) / 1e6,
      lng: Math.round((units.reduce((s, u) => s + u.r.lng, 0) / units.length) * 1e6) / 1e6,
      address: titleCase(building),
      city: titleCase(first.city),
      zip: first.zip,
      useType: '004',
      propertyType: 'condo',
      homestead: units.filter((u) => u.r.homestead).length * 2 > units.length,
      ownerName: null,
      unitOrder: units.map((u) => u.unit),
      unitOwnerNames: owners,
      inCampaign: false,
    });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function asLead(h: AreaHome): LeadHouse & { zip: string } {
  return { id: h.id, packId: '', packName: '', address: h.address, city: h.city, lat: h.lat, lng: h.lng, unitOrder: h.unitOrder, zip: h.zip };
}

/**
 * `homes` with `inCampaign` set by the lead-import duplicate rules (`dedupeLeads`): same door id,
 * same normalized address, or within 4 m of a door of `campaignId` in `existing` (the portal passes
 * the campaign's doors inside the polygon's box padded by AREA_EXISTING_PAD_DEG).
 */
export function markInCampaign(homes: readonly AreaHome[], existing: readonly House[], campaignId: string): AreaHome[] {
  const leads = homes.map(asLead);
  const { kept } = dedupeLeads(leads, existing, campaignId);
  const fresh = new Set(kept.map((l) => l.id));
  return homes.map((h) => ({ ...h, inCampaign: !fresh.has(h.id) }));
}

export interface AreaSwitches {
  /** Single family and mobile homes only (no condos, no multi-family). */
  housesOnly: boolean;
  /** Homesteaded only (a condo building: most units homesteaded). */
  ownerOccupiedOnly: boolean;
}

export type AreaHomeStatus = 'add' | 'skip-rented' | 'skip-type' | 'already-in-campaign';

/** Kinds that count as houses for the Houses only switch. */
export const AREA_HOUSE_TYPES: readonly PropertyType[] = ['single-family', 'mobile-home'];

/** First match wins: already-in-campaign, skip-type (Houses only), skip-rented (Owner-occupied only), add. */
export function areaHomeStatus(home: Pick<AreaHome, 'inCampaign' | 'propertyType' | 'homestead'>, s: AreaSwitches): AreaHomeStatus {
  if (home.inCampaign) return 'already-in-campaign';
  if (s.housesOnly && !AREA_HOUSE_TYPES.includes(home.propertyType)) return 'skip-type';
  if (s.ownerOccupiedOnly && !home.homestead) return 'skip-rented';
  return 'add';
}

export interface AreaPreviewCounts {
  /** Doors inside the polygon (every status). */
  inside: number;
  add: number;
  skipRented: number;
  skipType: number;
  alreadyInCampaign: number;
}

export function areaPreviewCounts(homes: readonly Pick<AreaHome, 'inCampaign' | 'propertyType' | 'homestead'>[], s: AreaSwitches): AreaPreviewCounts {
  const c: AreaPreviewCounts = { inside: homes.length, add: 0, skipRented: 0, skipType: 0, alreadyInCampaign: 0 };
  for (const h of homes) {
    const status = areaHomeStatus(h, s);
    if (status === 'add') c.add++;
    else if (status === 'skip-rented') c.skipRented++;
    else if (status === 'skip-type') c.skipType++;
    else c.alreadyInCampaign++;
  }
  return c;
}

export interface AreaPackCount {
  packId: string;
  name: string;
  count: number;
}

/**
 * The door documents an import writes: the homes whose status is 'add', unassigned and
 * unknocked (`leadHouseDoc`, as every imported door), packed like the script's area import
 * (`packAreaHouses`: zip + ~1 km cell; `existingPacks` = the campaign's area packs so a cell it
 * already has keeps its name and new ones number on), plus `ownerOccupied` / `propertyType` (what
 * the app reads today) and `areaImportId`, `homestead`, `useType`, `ownerName` / `unitOwnerNames`.
 */
export function areaImportDocs(
  homes: readonly AreaHome[],
  s: AreaSwitches,
  opts: { campaignId: string; areaImportId: string; now: number; existingPacks: readonly Pick<House, 'packId' | 'packName'>[] },
): { houses: House[]; packs: AreaPackCount[] } {
  const adding = homes.filter((h) => areaHomeStatus(h, s) === 'add');
  const leads = adding.map(asLead);
  packAreaHouses(leads, opts.existingPacks);
  const docOpts = { campaignId: opts.campaignId, assignedRepId: null, managerId: null, now: opts.now, by: '' };
  const houses: House[] = adding.map((h, i) => {
    const doc: HouseDoc = {
      ...leadHouseDoc(leads[i], docOpts),
      ownerOccupied: h.homestead,
      propertyType: h.propertyType,
      areaImportId: opts.areaImportId,
      homestead: h.homestead,
      useType: h.useType,
      ...(h.ownerName ? { ownerName: h.ownerName } : {}),
      ...(h.unitOwnerNames && Object.keys(h.unitOwnerNames).length > 0 ? { unitOwnerNames: h.unitOwnerNames } : {}),
    };
    return { id: h.id, ...doc };
  });
  const packs = new Map<string, AreaPackCount>();
  for (const h of houses) {
    const p = packs.get(h.packId) ?? { packId: h.packId, name: h.packName, count: 0 };
    p.count++;
    packs.set(h.packId, p);
  }
  return { houses, packs: [...packs.values()].sort((a, b) => naturalCompare(a.name, b.name)) };
}

type DoorState = { last?: unknown; notHomeCount?: unknown; importedMark?: unknown } | null | undefined;

function touchedState(s: DoorState): boolean {
  if (!s) return false;
  return (s.last !== null && s.last !== undefined) || (typeof s.notHomeCount === 'number' && s.notHomeCount > 0) || (s.importedMark !== null && s.importedMark !== undefined);
}

/**
 * Remove may delete this door: nobody has ever touched it. Touched = any knock history
 * (`hasKnocks`: a knock doc names this door, which includes a result later reset to blank by a
 * lasso), a result (`last`, a Not Home count, an imported result; an appointment lives on `last`)
 * on the door or any unit, a door or unit note, or a No Soliciting sign. Assignment does not
 * matter. Reads raw Firestore data (missing fields = untouched).
 */
export function isUntouchedDoor(d: Partial<HouseDoc>, hasKnocks: boolean): boolean {
  if (hasKnocks) return false;
  if (touchedState(d)) return false;
  if (d.units) for (const u of Object.values(d.units)) if (touchedState(u)) return false;
  if (d.doorNote) return false;
  if (d.unitNotes && Object.keys(d.unitNotes).length > 0) return false;
  if (d.noSoliciting) return false;
  return true;
}

/**
 * Splits an area's doors for Remove: `removable` = untouched ids, `kept` = the rest.
 * `knockedHouseIds` = `houseId`s of the campaign's knocks created at or after the area's
 * `createdAt` (no door of the area existed before it).
 */
export function splitForRemove(
  doors: readonly (Partial<HouseDoc> & { id: string })[],
  knockedHouseIds: ReadonlySet<string>,
): { removable: string[]; kept: string[] } {
  const removable: string[] = [];
  const kept: string[] = [];
  for (const d of doors) (isUntouchedDoor(d, knockedHouseIds.has(d.id)) ? removable : kept).push(d.id);
  return { removable, kept };
}
