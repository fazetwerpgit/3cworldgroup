/**
 * Area import (LOGIC_REQUESTS #17, AREA_IMPORT_SPEC.md): every home in a zip code, from the county
 * property tax roll, as unassigned doors of a (solar) campaign. Florida's tax roll (FDOR NAL file +
 * parcel shapefile) is a free public record with a homestead flag (owner lives there) and a DOR use
 * code (single family, condo, ...).
 *
 * Pure and self-contained like leadImport.ts (no React Native, Firebase or app modules). File
 * formats stay outside the planner: `parcelFromNal` maps one NAL record (+ its parcel centroid,
 * read by scripts/parcelShapes.ts) to a `ParcelRow`; `planAreaImport` turns rows into houses.
 */
import { dedupeLeads, leadDocId, leadHouseDoc, normalizeAddress, titleCase, type LeadHouse } from './leadImport';
import type { House, PropertyType } from './types';

/** One tax-roll parcel, independent of the file it came from. */
export interface ParcelRow {
  /** Unique within the source; NAL: `<county no>-<PARCEL_ID>`, e.g. "26-1697810000R". */
  parcelId: string;
  /** Physical street address as on the roll, unit included ("1050 HENDRICKS AVE 101"); '' when none. */
  address: string;
  city: string;
  /** Five-digit physical zip code. */
  zip: string;
  /** DOR land use code, three digits ("001" = single family). */
  useCode: string;
  /** The parcel has a homestead exemption: its owner lives there. */
  homestead: boolean;
  /** Parcel centroid; null when the parcel has no polygon in the parcel map. */
  lat: number | null;
  lng: number | null;
}

// ---------------------------------------------------------------------------------------------
// FDOR NAL file (statewide tax roll CSV, one schema for all 67 counties)

/**
 * NAL columns `parcelFromNal` reads (2026 NAL user guide fields 1, 2, 8, 18, 99-102, 110). Mailing
 * addresses are never read; the owner name (`OWN_NAME`, field 77) is read only by the parcel tiler
 * (scripts/build-parcel-tiles.ts, docs/AREA_IMPORT_API.md).
 */
export const NAL_COLUMNS = [
  'CO_NO',
  'PARCEL_ID',
  'DOR_UC',
  'JV_HMSTD',
  'EXMPT_01',
  'PHY_ADDR1',
  'PHY_ADDR2',
  'PHY_CITY',
  'PHY_ZIPCD',
] as const;
export type NalRecord = Record<(typeof NAL_COLUMNS)[number], string>;

/**
 * A NAL record as a parcel row. `centroid` is the parcel's polygon centroid, looked up by
 * `PARCEL_ID` in the county parcel shapefile (`PARCELNO`); missing = no polygon. Homestead =
 * homestead just value (`JV_HMSTD`) or the $25,000 homestead exemption (`EXMPT_01`) above 0.
 */
export function parcelFromNal(rec: NalRecord, centroid: { lat: number; lng: number } | null | undefined): ParcelRow {
  return {
    parcelId: `${rec.CO_NO.trim()}-${rec.PARCEL_ID.trim()}`,
    address: `${rec.PHY_ADDR1} ${rec.PHY_ADDR2}`.trim().replace(/\s+/g, ' '),
    city: rec.PHY_CITY.trim(),
    zip: rec.PHY_ZIPCD.trim().slice(0, 5),
    useCode: rec.DOR_UC.trim().padStart(3, '0'),
    homestead: Number(rec.JV_HMSTD) > 0 || Number(rec.EXMPT_01) > 0,
    lat: centroid?.lat ?? null,
    lng: centroid?.lng ?? null,
  };
}

// ---------------------------------------------------------------------------------------------
// Plan

/** The DOR use codes that are homes a rep can knock, and what each becomes. */
export const AREA_PROPERTY_TYPES: Readonly<Record<string, PropertyType>> = {
  '001': 'single-family',
  '002': 'mobile-home',
  '004': 'condo',
  '008': 'multi-family', // 2 to 9 units, one owner: one door
};
export type AreaUseCode = '001' | '002' | '004' | '008';

/**
 * Imported when the caller doesn't choose: single family only (the research's pick: a solar sale
 * needs an owner with their own roof). Mobile homes, condos and small multi-family are opt-in.
 */
export const DEFAULT_AREA_USE_CODES: readonly AreaUseCode[] = ['001'];

/**
 * Area pack grid: cells of ~1 km (0.009° lat ≈ 1.0 km; 0.0104° lng ≈ 1.0 km at 30°N, Jacksonville).
 * A whole zip is 7-24k homes and 2 km cells reach ~2,000 doors in Jacksonville's dense zips; 1 km
 * keeps a pack to a few hundred doors (single family: 32207 at most 648, 32218 at most 755), a few
 * days for one rep. Cells cut by the zip line give small packs; lasso / Split still regroup doors.
 */
export const AREA_PACK_LAT_DEG = 0.009;
export const AREA_PACK_LNG_DEG = 0.0104;

/**
 * Why a row is not a door: `other-zip` (not a requested zip), `not-residential` (use code is not
 * a home), `type-not-included` (a home type left out of `includeUseCodes`), `no-street-number`
 * (the roll has only a road name), `no-coordinates` (no parcel polygon), `not-owner-occupied` (with
 * `ownerOccupiedOnly`), `repeated` (the same parcel, address or condo unit again).
 */
export type AreaSkipReason =
  | 'other-zip'
  | 'not-residential'
  | 'type-not-included'
  | 'no-street-number'
  | 'no-coordinates'
  | 'not-owner-occupied'
  | 'repeated';
const SKIP_ORDER: readonly AreaSkipReason[] = [
  'other-zip',
  'not-residential',
  'type-not-included',
  'no-street-number',
  'no-coordinates',
  'not-owner-occupied',
  'repeated',
];

export interface AreaPackSummary {
  packId: string;
  name: string;
  /** Doors this import adds to the pack. */
  count: number;
  /** The campaign has no doors in this pack yet. */
  isNew: boolean;
}

export interface AreaImportPlan {
  campaignId: string;
  zips: string[];
  /** Parcel rows given. */
  rows: number;
  /** Ready-to-write docs: unassigned, unknocked, `updatedAt` = plan time, with `ownerOccupied` / `propertyType`. */
  houses: House[];
  /** Packs the houses go into, by name (natural order). */
  packs: AreaPackSummary[];
  /** Rows left out and why (reasons with a count of 0 omitted). */
  skipped: { reason: AreaSkipReason; count: number }[];
  /** Doors already in the campaign (same id, address or within 4 m: `dedupeLeads`), not in `houses`. */
  duplicates: number;
  /** Condo buildings among `houses`, and their units in total. */
  mdus: number;
  units: number;
  /**
   * Where the rows went, before dropping doors already in the campaign: `houseRows` became one door
   * each; `unitRows` became units of `buildings` condo buildings. rows = houseRows + unitRows + the
   * `skipped` counts.
   */
  rowsBreakdown: { houseRows: number; unitRows: number; buildings: number };
}

export interface AreaPlanOptions {
  campaignId: string;
  /** Five-digit zip codes to import. */
  zips: readonly string[];
  /** Houses already in `campaignId` (other campaigns' doors are ignored). */
  existing: readonly House[];
  /** DOR use codes to import (default DEFAULT_AREA_USE_CODES). */
  includeUseCodes?: readonly AreaUseCode[];
  /** Only homesteaded parcels (condo buildings: only homesteaded units). */
  ownerOccupiedOnly?: boolean;
  now?: number;
}

interface AreaHouse extends LeadHouse {
  zip: string;
  ownerOccupied: boolean;
  propertyType: PropertyType;
}

/** Condo units of one building (same zip + street address before the unit), while planning. */
interface CondoBuilding {
  building: string;
  city: string;
  zip: string;
  units: { unit: string; row: ParcelRow }[];
}

const naturalCompare = new Intl.Collator('en', { numeric: true }).compare;

/** Lowercase id-safe form: "26-1697810000R" -> "26-1697810000r". */
function idPart(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Door id of a tax-roll parcel in a campaign: `<campaignId>__area-<parcel id>`, or for a condo
 * building (`mdu`, `parcelId` = its lowest unit parcel id) `<campaignId>__area-mdu-<parcel id>`.
 * The script and the portal's drawn-area import use the same ids, so either sees the other's doors.
 */
export function areaDoorId(campaignId: string, parcelId: string, mdu = false): string {
  return leadDocId(campaignId, `area-${mdu ? 'mdu-' : ''}${idPart(parcelId)}`);
}

/**
 * A condo address split into building + unit: "1050 HENDRICKS AVE 101" -> "1050 HENDRICKS AVE" +
 * "101", "7615 LAS PALMAS WAY G-41", "12 OAK ST UNIT 4" -> "4". The unit is the last word when it
 * has a digit or is a single letter, and a street remains. Null when there is no unit.
 */
export function splitCondoUnit(address: string): { building: string; unit: string } | null {
  const m = /^(\d\S*\s+\S.*?)\s+(?:(?:UNIT|APT|STE|SUITE)\s+)?#?(\S*\d\S*|[A-Z])$/i.exec(address);
  return m ? { building: m[1], unit: m[2].toUpperCase() } : null;
}

/**
 * What importing these parcels into the campaign would write: keeps homes (`includeUseCodes`) in
 * `zips` with a street number and a map location, one door per parcel (`unitOrder` null; a
 * multi-family parcel has one owner, so one door), except condos of one building (same street
 * address before the unit), which become one MDU door with the units in natural order. Ids are
 * campaign-scoped (`leadDocId`): `area-<parcel id>`, condo buildings `area-mdu-<lowest parcel id>`,
 * so a re-import is all duplicates. Doors already in the campaign are dropped (`dedupeLeads`), the
 * rest packed in ~1 km cells per zip (`packAreaHouses`). Nothing is written.
 */
export function planAreaImport(parcels: readonly ParcelRow[], opts: AreaPlanOptions): AreaImportPlan {
  const zips = new Set(opts.zips);
  const include = new Set<string>(opts.includeUseCodes ?? DEFAULT_AREA_USE_CODES);
  const skipped = Object.fromEntries(SKIP_ORDER.map((r) => [r, 0])) as Record<AreaSkipReason, number>;
  const seenParcels = new Set<string>();
  const seenAddresses = new Set<string>();
  // Doors in row order; a condo building holds its place from its first unit.
  const doors: (AreaHouse | CondoBuilding)[] = [];
  const buildings = new Map<string, CondoBuilding>();

  const single = (p: ParcelRow, address: string, type: PropertyType): AreaHouse => ({
    id: areaDoorId(opts.campaignId, p.parcelId),
    packId: '',
    packName: '',
    address: titleCase(address),
    city: titleCase(p.city),
    lat: p.lat as number,
    lng: p.lng as number,
    unitOrder: null,
    zip: p.zip,
    ownerOccupied: p.homestead,
    propertyType: type,
  });

  for (const p of parcels) {
    if (!zips.has(p.zip)) {
      skipped['other-zip']++;
      continue;
    }
    const type = AREA_PROPERTY_TYPES[p.useCode];
    if (!type) {
      skipped['not-residential']++;
      continue;
    }
    if (!include.has(p.useCode)) {
      skipped['type-not-included']++;
      continue;
    }
    const address = p.address.trim().replace(/\s+/g, ' ');
    if (!/^\d/.test(address)) {
      skipped['no-street-number']++;
      continue;
    }
    if (p.lat === null || p.lng === null || !Number.isFinite(p.lat) || !Number.isFinite(p.lng)) {
      skipped['no-coordinates']++;
      continue;
    }
    if (opts.ownerOccupiedOnly && !p.homestead) {
      skipped['not-owner-occupied']++;
      continue;
    }
    if (seenParcels.has(p.parcelId)) {
      skipped.repeated++;
      continue;
    }
    seenParcels.add(p.parcelId);

    const split = type === 'condo' ? splitCondoUnit(address) : null;
    if (split) {
      const key = `${p.zip}|${normalizeAddress(split.building, p.city)}`;
      const building = buildings.get(key);
      if (!building) {
        const created = { building: split.building, city: p.city, zip: p.zip, units: [{ unit: split.unit, row: p }] };
        buildings.set(key, created);
        doors.push(created);
      } else if (building.units.some((u) => u.unit === split.unit)) {
        skipped.repeated++;
      } else {
        building.units.push({ unit: split.unit, row: p });
      }
      continue;
    }
    const key = normalizeAddress(address, p.city);
    if (seenAddresses.has(key)) {
      skipped.repeated++;
      continue;
    }
    seenAddresses.add(key);
    doors.push(single(p, address, type));
  }

  // Condo buildings: one door at the units' mean position; a lone unit stays a plain door.
  const mapped: AreaHouse[] = [];
  let unitRows = 0;
  let buildingCount = 0;
  for (const door of doors) {
    if (!('building' in door)) {
      mapped.push(door);
      continue;
    }
    if (door.units.length === 1) {
      const { row } = door.units[0];
      const key = normalizeAddress(row.address, row.city);
      if (seenAddresses.has(key)) skipped.repeated++;
      else {
        seenAddresses.add(key);
        mapped.push(single(row, row.address.trim().replace(/\s+/g, ' '), 'condo'));
      }
      continue;
    }
    const units = [...door.units].sort((a, b) => naturalCompare(a.unit, b.unit));
    const lowest = [...door.units].sort((a, b) => naturalCompare(a.row.parcelId, b.row.parcelId))[0].row;
    let lat = 0;
    let lng = 0;
    for (const { row } of units) {
      lat += row.lat as number;
      lng += row.lng as number;
    }
    unitRows += units.length;
    buildingCount++;
    mapped.push({
      id: areaDoorId(opts.campaignId, lowest.parcelId, true),
      packId: '',
      packName: '',
      address: titleCase(door.building),
      city: titleCase(door.city),
      lat: Math.round((lat / units.length) * 1e6) / 1e6,
      lng: Math.round((lng / units.length) * 1e6) / 1e6,
      unitOrder: units.map((u) => u.unit),
      zip: door.zip,
      ownerOccupied: units.filter((u) => u.row.homestead).length * 2 > units.length,
      propertyType: 'condo',
    });
  }

  const { kept, duplicates } = dedupeLeads(mapped, opts.existing, opts.campaignId);
  const mine = opts.existing.filter((h) => h.campaignId === opts.campaignId);
  packAreaHouses(kept, mine);

  // Tax-roll doors carry no statuses or notes, so nothing is stamped with `by`.
  const docOpts = { campaignId: opts.campaignId, assignedRepId: null, managerId: null, now: opts.now ?? Date.now(), by: '' };
  const houses: House[] = kept.map((h) => ({
    id: h.id,
    ...leadHouseDoc(h, docOpts),
    ownerOccupied: h.ownerOccupied,
    propertyType: h.propertyType,
  }));
  const known = new Set(mine.map((h) => h.packId));
  const packs = new Map<string, AreaPackSummary>();
  for (const h of houses) {
    const pack = packs.get(h.packId) ?? { packId: h.packId, name: h.packName, count: 0, isNew: !known.has(h.packId) };
    pack.count++;
    packs.set(h.packId, pack);
  }
  const mdus = houses.filter((h) => h.unitOrder);
  return {
    campaignId: opts.campaignId,
    zips: [...zips],
    rows: parcels.length,
    houses,
    packs: [...packs.values()].sort((a, b) => naturalCompare(a.name, b.name)),
    skipped: SKIP_ORDER.filter((r) => skipped[r] > 0).map((reason) => ({ reason, count: skipped[reason] })),
    duplicates,
    mdus: mdus.length,
    units: mdus.reduce((n, h) => n + (h.unitOrder?.length ?? 0), 0),
    rowsBreakdown: { houseRows: mapped.length - buildingCount, unitRows, buildings: buildingCount },
  };
}

/**
 * Sets packId/packName (in place): one pack per zip and ~1 km grid cell, packId
 * `area-<zip>-<row>_<col>` from the cell, so a later import of the same area lands in the same
 * packs. A cell the campaign already has keeps its name; new cells are named `<zip> <City> <k>`,
 * biggest first, numbered after the highest k the campaign already uses for that zip.
 */
export function packAreaHouses(
  houses: (LeadHouse & { zip: string })[],
  existing: readonly Pick<House, 'packId' | 'packName'>[] = [],
): void {
  const names = new Map<string, string>();
  const highest = new Map<string, number>();
  for (const h of existing) {
    const m = /^area-(\d{5})-/.exec(h.packId);
    if (!m) continue;
    names.set(h.packId, h.packName);
    const k = Number(/ (\d+)$/.exec(h.packName)?.[1] ?? 0);
    highest.set(m[1], Math.max(highest.get(m[1]) ?? 0, k));
  }
  const cells = new Map<string, (LeadHouse & { zip: string })[]>();
  for (const h of houses) {
    h.packId = `area-${h.zip}-${Math.floor(h.lat / AREA_PACK_LAT_DEG)}_${Math.floor(h.lng / AREA_PACK_LNG_DEG)}`;
    const cell = cells.get(h.packId);
    if (cell) cell.push(h);
    else cells.set(h.packId, [h]);
  }
  const fresh = [...cells].filter(([packId]) => !names.has(packId));
  fresh.sort(([a, ha], [b, hb]) => hb.length - ha.length || (a < b ? -1 : 1));
  for (const [packId, members] of fresh) {
    const zip = members[0].zip;
    const k = (highest.get(zip) ?? 0) + 1;
    highest.set(zip, k);
    const cityCounts = new Map<string, number>();
    for (const h of members) cityCounts.set(h.city, (cityCounts.get(h.city) ?? 0) + 1);
    const city = [...cityCounts].sort(([, a], [, b]) => b - a)[0][0];
    names.set(packId, [zip, city, String(k)].filter(Boolean).join(' '));
  }
  for (const h of houses) h.packName = names.get(h.packId) as string;
}
