// COPIED VERBATIM from 3c-knock-logic src/lib/leadImport.ts at commit 55ca6ae
// (/home/fazetwerpnerd69/dev/3c-knock-logic/src/lib/leadImport.ts, LEAD_IMPORT_SPEC.md there).
// Do not edit here: change it in the app repo and copy it again, so the phone and the portal
// plan an import the same way. ./types.ts holds the House/HouseDoc types it imports.

/**
 * Carrier lead-file import: CSV parsing, format detection, mapping of AT&T / SalesRabbit lead rows
 * to houses (packs, MDUs), dedupe against a campaign's existing houses, and the import plan the app
 * (store `previewLeadImport` / `importLeads`) and scripts/import-leads.ts write.
 *
 * Pure and self-contained (no React Native, Firebase or other app modules; only a type import), so
 * the portal can copy this file as is. Spec: LEAD_IMPORT_SPEC.md.
 */
import type { House, HouseDoc } from './types.ts';

const EARTH_RADIUS_M = 6_371_000;

/** Great-circle distance (same formula as geo.ts `distanceMeters`, inlined to stay self-contained). */
function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Parses RFC 4180 CSV (quoted fields, doubled quotes, CRLF/LF, newlines inside quotes). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (src[i + 1] === '"') {
        field += '"';
        i++;
      } else quoted = false;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((f) => f.trim() !== ''));
}

/** CSV text to header-keyed records (missing trailing cells read as ''). */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const [header, ...rows] = parseCsv(text);
  return header ? toRecords(header, rows) : [];
}

function toRecords(header: string[], rows: string[][]): Record<string, string>[] {
  const keys = header.map((h) => h.trim());
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? '').trim()])));
}

const UPPER_WORDS = new Set(['N', 'S', 'E', 'W', 'NE', 'NW', 'SE', 'SW']);

/** "FORREST SPRING" -> "Forrest Spring"; directionals stay upper ("NW"); "12TH" -> "12th". */
export function titleCase(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const up = w.toUpperCase();
      if (UPPER_WORDS.has(up)) return up;
      const lower = w.toLowerCase();
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/**
 * Pack code from the PSA column: the first carrier pack code (digits + "P" + letter, e.g.
 * "4043PA"), else the first non-null code. "null,4043PA" -> "4043PA"; "3218,3504PA" -> "3504PA".
 */
export function packFromPsa(psa: string): string | null {
  const codes = psa
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c !== '' && c.toLowerCase() !== 'null');
  return codes.find((c) => /^\d+P[A-Z]$/i.test(c))?.toUpperCase() ?? codes[0]?.toUpperCase() ?? null;
}

/** A mapped lead house, independent of who it is assigned to. */
export interface LeadHouse {
  id: string;
  packId: string;
  packName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  /** Unit labels for an MDU (natural order); null for a single-family house. */
  unitOrder: string[] | null;
  /** No street address in the source; the app reverse-geocodes it on first open. */
  addressPending?: true;
  /** Contact first name from the source (single-family houses only). */
  contactName?: string;
}
export interface LeadMapResult {
  houses: LeadHouse[];
  skipped: { notAllowed: number; noCoords: number; noPack: number };
}

const naturalCompare = new Intl.Collator('en', { numeric: true }).compare;

/**
 * Maps AT&T lead records to houses. Skips rows not door-knock-allowed, without coordinates or
 * without a pack. Rows sharing a building address (same street address + city) that carry a Unit
 * Number collapse into one MDU house, positioned at the first unit's coordinates.
 */
export function mapAttLeads(records: Record<string, string>[]): LeadMapResult {
  const skipped = { notAllowed: 0, noCoords: 0, noPack: 0 };
  const singles: LeadHouse[] = [];
  const buildings = new Map<string, { base: LeadHouse; luids: string[]; units: Set<string> }>();

  for (const r of records) {
    if ((r['Door Knock Allowed'] ?? '').toUpperCase() !== 'Y') {
      skipped.notAllowed++;
      continue;
    }
    const lat = Number.parseFloat(r.Latitude ?? '');
    const lng = Number.parseFloat(r.Longitude ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      skipped.noCoords++;
      continue;
    }
    const pack = packFromPsa(r.PSA ?? '');
    if (!pack) {
      skipped.noPack++;
      continue;
    }
    const address = titleCase(
      [r['Street Number'], r['Street Prefix'], r['Street Name'], r['Street Type'], r['Street Suffix']].join(' '),
    );
    const city = titleCase(r.City ?? '');
    const luid = (r['Living Unit ID'] ?? '').trim() || `${address} ${city}`;
    const base: LeadHouse = {
      id: `att-${slug(luid)}`,
      packId: `att-${pack.toLowerCase()}`,
      packName: pack,
      address,
      city,
      lat,
      lng,
      unitOrder: null,
    };
    const unit = (r['Unit Number'] ?? '').trim().toUpperCase();
    if (!unit) {
      singles.push(base);
      continue;
    }
    const key = `${address}|${city}`.toLowerCase();
    const b = buildings.get(key) ?? { base, luids: [], units: new Set<string>() };
    b.luids.push(luid);
    b.units.add(unit);
    buildings.set(key, b);
  }

  const mdus: LeadHouse[] = [...buildings.values()].map((b) => ({
    ...b.base,
    // Deterministic regardless of row order: lowest Living Unit ID in the building.
    id: `att-mdu-${slug([...b.luids].sort()[0])}`,
    unitOrder: [...b.units].sort(naturalCompare),
  }));
  const houses = [...singles, ...mdus];
  const seen = new Set<string>();
  const unique = houses.filter((h) => !seen.has(h.id) && seen.add(h.id));
  return { houses: unique, skipped };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/** Rows of a SalesRabbit export within this distance with Apt/Suite values share one MDU. */
export const SR_MDU_RADIUS_M = 3;

/** SR pack grid: cells of ~2 km (0.018° lat ≈ 2.0 km; 0.022° lng ≈ 2.0 km at 33-36°N). */
const SR_PACK_LAT_DEG = 0.018;
const SR_PACK_LNG_DEG = 0.022;

/** Areas SR packs are named after (nearest centre wins). */
const SR_AREAS = [
  { name: 'OKC', lat: 35.4676, lng: -97.5164 },
  { name: 'Dallas', lat: 32.7767, lng: -96.797 },
];

/**
 * Maps SalesRabbit lead records (no address; Latitude/Longitude, optional Apt/Suite and First
 * Name) to houses with `addressPending`. Rows with Apt/Suite within SR_MDU_RADIUS_M of each other
 * become one MDU whose unitOrder is the apt values. Houses are packed by `packSrHouses`. Ids derive
 * from coordinates, so re-imports of the same file hit the same docs.
 */
export function mapSrLeads(records: Record<string, string>[]): LeadMapResult {
  const result = srLeadHouses(records);
  packSrHouses(result.houses);
  return result;
}

/** `mapSrLeads` without packs (packId/packName ''), so duplicates can be dropped before packing. */
function srLeadHouses(records: Record<string, string>[]): LeadMapResult {
  const skipped = { notAllowed: 0, noCoords: 0, noPack: 0 };
  const rows: { lat: number; lng: number; apt: string; name: string }[] = [];
  for (const r of records) {
    const lat = Number.parseFloat(r.Latitude ?? '');
    const lng = Number.parseFloat(r.Longitude ?? '');
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
      skipped.noCoords++;
      continue;
    }
    rows.push({ lat, lng, apt: (r['Apt/Suite'] ?? '').trim().toUpperCase(), name: titleCase(r['First Name'] ?? '') });
  }
  // Stable order makes clustering and id collisions independent of file order.
  rows.sort((a, b) => a.lat - b.lat || a.lng - b.lng || naturalCompare(a.apt, b.apt) || naturalCompare(a.name, b.name));

  const base = { packId: '', packName: '', address: '', city: '', addressPending: true as const };
  const houses: LeadHouse[] = [];
  // Grid cells of ~11 m so a neighbour search only checks the 3x3 block around a row.
  const cell = (v: number) => Math.floor(v * 10_000);
  const grid = new Map<string, { lat: number; lng: number; units: Set<string> }[]>();
  const buildings: { lat: number; lng: number; units: Set<string> }[] = [];
  for (const row of rows) {
    if (!row.apt) {
      houses.push({ ...base, id: '', lat: row.lat, lng: row.lng, unitOrder: null, ...(row.name ? { contactName: row.name } : {}) });
      continue;
    }
    let found: (typeof buildings)[number] | undefined;
    for (let dy = -1; dy <= 1 && !found; dy++) {
      for (let dx = -1; dx <= 1 && !found; dx++) {
        found = grid
          .get(`${cell(row.lat) + dy}:${cell(row.lng) + dx}`)
          ?.find((b) => distanceMeters(b, row) <= SR_MDU_RADIUS_M);
      }
    }
    if (found) {
      found.units.add(row.apt);
      continue;
    }
    const b = { lat: row.lat, lng: row.lng, units: new Set([row.apt]) };
    buildings.push(b);
    const key = `${cell(row.lat)}:${cell(row.lng)}`;
    grid.set(key, [...(grid.get(key) ?? []), b]);
  }
  for (const b of buildings) {
    houses.push({ ...base, id: '', lat: b.lat, lng: b.lng, unitOrder: [...b.units].sort(naturalCompare) });
  }
  const used = new Set<string>();
  for (const h of houses) {
    const stem = `att-sr-${h.unitOrder ? 'mdu-' : ''}${slug(`${h.lat.toFixed(6)} ${h.lng.toFixed(6)}`)}`;
    let id = stem;
    for (let n = 2; used.has(id); n++) id = `${stem}-${n}`;
    used.add(id);
    h.id = id;
  }
  return { houses, skipped };
}

/** The SR pack grid cell (~2 km) a point falls in. */
function srPackCell(p: { lat: number; lng: number }): string {
  return `${Math.floor(p.lat / SR_PACK_LAT_DEG)}:${Math.floor(p.lng / SR_PACK_LNG_DEG)}`;
}

/**
 * Sets packId/packName on SalesRabbit houses (in place): one pack per ~2 km grid cell, packId
 * `att-sr-<n>` numbered biggest cell first, packName 'SR <area> <k>' numbered per area. With the
 * campaign's `existing` houses, a cell that already has an SR pack joins it (the pack holding most
 * of that cell's doors) and new packs are numbered after the highest `n` / `k` already used, so a
 * second SR file never reuses a pack id or name.
 */
export function packSrHouses(
  houses: LeadHouse[],
  existing: readonly Pick<HouseDoc, 'lat' | 'lng' | 'packId' | 'packName'>[] = [],
): void {
  let lastPack = 0;
  const perArea: Record<string, number> = {};
  const votes = new Map<string, Map<string, { packName: string; count: number }>>();
  for (const h of existing) {
    const n = /^att-sr-(\d+)$/.exec(h.packId);
    if (!n) continue;
    lastPack = Math.max(lastPack, Number(n[1]));
    const named = /^SR (.+) (\d+)$/.exec(h.packName);
    if (named) perArea[named[1]] = Math.max(perArea[named[1]] ?? 0, Number(named[2]));
    const key = srPackCell(h);
    const packs = votes.get(key) ?? new Map<string, { packName: string; count: number }>();
    const vote = packs.get(h.packId) ?? { packName: h.packName, count: 0 };
    vote.count++;
    packs.set(h.packId, vote);
    votes.set(key, packs);
  }

  const cells = new Map<string, LeadHouse[]>();
  for (const h of houses) {
    const key = srPackCell(h);
    cells.set(key, [...(cells.get(key) ?? []), h]);
  }
  [...cells.entries()]
    .sort(([ka, a], [kb, b]) => b.length - a.length || ka.localeCompare(kb))
    .forEach(([key, members]) => {
      const joined = [...(votes.get(key)?.entries() ?? [])].sort(
        ([ia, a], [ib, b]) => b.count - a.count || ia.localeCompare(ib),
      )[0] as [string, { packName: string; count: number }] | undefined;
      let packId: string;
      let packName: string;
      if (joined) {
        [packId, { packName }] = joined;
      } else {
        const lat = members.reduce((s, h) => s + h.lat, 0) / members.length;
        const lng = members.reduce((s, h) => s + h.lng, 0) / members.length;
        const area = SR_AREAS.reduce((best, a) =>
          distanceMeters({ lat, lng }, a) < distanceMeters({ lat, lng }, best) ? a : best,
        ).name;
        perArea[area] = (perArea[area] ?? 0) + 1;
        packId = `att-sr-${++lastPack}`;
        packName = `SR ${area} ${perArea[area]}`;
      }
      for (const h of members) {
        h.packId = packId;
        h.packName = packName;
      }
    });
}

/** A fresh house doc for a lead house (unknocked). */
export function leadHouseDoc(
  h: LeadHouse,
  opts: { campaignId: string; assignedRepId: string | null; managerId: string | null; now: number },
): HouseDoc {
  return {
    campaignId: opts.campaignId,
    packId: h.packId,
    packName: h.packName,
    address: h.address,
    city: h.city,
    lat: h.lat,
    lng: h.lng,
    assignedRepId: opts.assignedRepId,
    managerId: opts.assignedRepId ? opts.managerId : null,
    last: null,
    notHomeCount: 0,
    unitOrder: h.unitOrder,
    units: h.unitOrder ? {} : null,
    movedBy: null,
    createdBy: null,
    updatedAt: opts.now,
    ...(h.addressPending ? { addressPending: true as const } : {}),
    ...(h.contactName ? { contactName: h.contactName } : {}),
  };
}

/** Saved import (scripts/fixtures/local/att-leads.json) that scripts/seed.ts replays. */
export interface LeadFixture {
  campaignId: string;
  campaignName: string;
  /** Portal provider name, set on the campaign when it is first created (and patched if missing). */
  carrier?: string;
  /** Email of the rep the houses are assigned to (and whose active campaign this becomes); null = unassigned. */
  assignEmail: string | null;
  houses: LeadHouse[];
}

// ---------------------------------------------------------------------------------------------
// Import plan (app, portal and scripts/import-leads.ts): detect, map, drop duplicates, pack.
// ---------------------------------------------------------------------------------------------

/** 'att': AT&T lead list (street address, PSA pack). 'sr': SalesRabbit export (coordinates only). */
export type LeadFormat = 'att' | 'sr';

/**
 * The format of a lead file from its header row (exact column names, as the mappers read them):
 * Latitude + Longitude, plus Door Knock Allowed + PSA for AT&T, or Apt/Suite for SalesRabbit.
 * Null when it is neither.
 */
export function detectLeadFormat(header: readonly string[]): LeadFormat | null {
  const columns = new Set(header.map((h) => h.trim()));
  if (!columns.has('Latitude') || !columns.has('Longitude')) return null;
  if (columns.has('Door Knock Allowed') && columns.has('PSA')) return 'att';
  if (columns.has('Apt/Suite')) return 'sr';
  return null;
}

/**
 * A lead this close to a door already in the campaign is that door, unless both have a street
 * address and the addresses differ (duplex halves often share one map point).
 */
export const DUPLICATE_RADIUS_M = 4;

/** Long forms folded into the short forms carrier files use, for address comparison. */
const ADDRESS_WORDS: Record<string, string> = {
  street: 'st',
  avenue: 'ave',
  av: 'ave',
  road: 'rd',
  drive: 'dr',
  lane: 'ln',
  court: 'ct',
  boulevard: 'blvd',
  place: 'pl',
  circle: 'cir',
  terrace: 'ter',
  parkway: 'pkwy',
  highway: 'hwy',
  trail: 'trl',
  north: 'n',
  south: 's',
  east: 'e',
  west: 'w',
  northeast: 'ne',
  northwest: 'nw',
  southeast: 'se',
  southwest: 'sw',
};

/**
 * Address + city as a comparison key, ignoring case, punctuation and long forms ("12 North Oak
 * Street", "Testville" and "12 N OAK ST", "TESTVILLE" match). '' when there is no street address.
 */
export function normalizeAddress(address: string, city: string): string {
  const words = (s: string) =>
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter(Boolean)
      .map((w) => ADDRESS_WORDS[w] ?? w)
      .join(' ');
  const street = words(address);
  return street ? `${street}|${words(city)}` : '';
}

export interface LeadDedupe {
  kept: LeadHouse[];
  /** Leads that are already doors in this campaign. */
  duplicates: number;
  /** Leads whose id is a door in another campaign (writing them would move that door here). */
  inOtherCampaign: number;
}

/**
 * Drops leads that are already doors. Same id as an existing house: a duplicate when it is in
 * this campaign, else `inOtherCampaign`. Otherwise a duplicate when a door of this campaign has
 * the same normalized address, or is within DUPLICATE_RADIUS_M (see there).
 */
export function dedupeLeads(leads: readonly LeadHouse[], existing: readonly House[], campaignId: string): LeadDedupe {
  const campaignOf = new Map(existing.map((h) => [h.id, h.campaignId]));
  const mine = existing.filter((h) => h.campaignId === campaignId);
  const addresses = new Set(mine.map((h) => normalizeAddress(h.address, h.city)).filter(Boolean));
  // Cells of 0.0001° (~11 m; ~9 m of longitude at 35°N), so a 3x3 block covers the radius.
  const cell = (v: number) => Math.floor(v * 10_000);
  const grid = new Map<string, House[]>();
  for (const h of mine) {
    const key = `${cell(h.lat)}:${cell(h.lng)}`;
    const bucket = grid.get(key);
    if (bucket) bucket.push(h);
    else grid.set(key, [h]);
  }

  const kept: LeadHouse[] = [];
  let duplicates = 0;
  let inOtherCampaign = 0;
  for (const lead of leads) {
    const owner = campaignOf.get(lead.id);
    if (owner !== undefined && owner !== campaignId) {
      inOtherCampaign++;
      continue;
    }
    const key = normalizeAddress(lead.address, lead.city);
    let duplicate = owner !== undefined || (key !== '' && addresses.has(key));
    for (let dy = -1; dy <= 1 && !duplicate; dy++) {
      for (let dx = -1; dx <= 1 && !duplicate; dx++) {
        duplicate = (grid.get(`${cell(lead.lat) + dy}:${cell(lead.lng) + dx}`) ?? []).some((h) => {
          if (distanceMeters(h, lead) > DUPLICATE_RADIUS_M) return false;
          const other = normalizeAddress(h.address, h.city);
          return key === '' || other === '' || other === key;
        });
      }
    }
    if (duplicate) duplicates++;
    else kept.push(lead);
  }
  return { kept, duplicates, inOtherCampaign };
}

export type LeadSkipReason = 'not-door-knock-allowed' | 'no-coordinates' | 'no-pack' | 'in-other-campaign';

export interface LeadPackSummary {
  packId: string;
  name: string;
  /** Houses this import adds to the pack. */
  count: number;
  /** The campaign has no doors in this pack yet. */
  isNew: boolean;
}

export interface LeadImportPlan {
  format: LeadFormat;
  campaignId: string;
  /** Data rows in the file (blank lines ignored). */
  rows: number;
  /** Ready-to-write docs (unknocked, `updatedAt` = plan time), in file mapping order. */
  houses: House[];
  /** Packs the houses go into, by name (natural order). */
  packs: LeadPackSummary[];
  /** Rows / leads left out and why (reasons with a count of 0 omitted). */
  skipped: { reason: LeadSkipReason; count: number }[];
  /** Leads already in the campaign (not in `houses`). */
  duplicates: number;
  /** Apartment buildings among `houses`, and their units in total. */
  mdus: number;
  units: number;
}

export interface LeadPlanOptions {
  campaignId: string;
  /**
   * Houses already on the server (and queued): every door of `campaignId`, plus any others known
   * (used only to catch id collisions with other campaigns).
   */
  existing: readonly House[];
  /** Rep the houses go to (with that rep's manager); omitted/null = unassigned. */
  assignTo?: { repId: string; managerId: string | null } | null;
  /** Skips header detection. */
  format?: LeadFormat;
  now?: number;
}

export type LeadPlanResult = { ok: true; plan: LeadImportPlan } | { ok: false; reason: 'empty' | 'unknown-format' };

/**
 * What importing this CSV into the campaign would write: detects the format, maps rows to houses
 * (AT&T: PSA packs, MDUs by building; SR: ~2 km packs continuing the campaign's SR pack numbers,
 * MDUs by 3 m apt clusters, `addressPending`), and drops leads already in the campaign. Nothing is
 * written.
 */
export function planLeadImport(text: string, opts: LeadPlanOptions): LeadPlanResult {
  const [header, ...rows] = parseCsv(text);
  if (!header || rows.length === 0) return { ok: false, reason: 'empty' };
  const format = opts.format ?? detectLeadFormat(header);
  if (!format) return { ok: false, reason: 'unknown-format' };
  const records = toRecords(header, rows);
  const mapped = format === 'att' ? mapAttLeads(records) : srLeadHouses(records);
  const { kept, duplicates, inOtherCampaign } = dedupeLeads(mapped.houses, opts.existing, opts.campaignId);
  const mine = opts.existing.filter((h) => h.campaignId === opts.campaignId);
  if (format === 'sr') packSrHouses(kept, mine);

  const doc = {
    campaignId: opts.campaignId,
    assignedRepId: opts.assignTo?.repId ?? null,
    managerId: opts.assignTo?.managerId ?? null,
    now: opts.now ?? Date.now(),
  };
  const houses: House[] = kept.map((h) => ({ id: h.id, ...leadHouseDoc(h, doc) }));
  const known = new Set(mine.map((h) => h.packId));
  const packs = new Map<string, LeadPackSummary>();
  for (const h of houses) {
    const pack = packs.get(h.packId) ?? { packId: h.packId, name: h.packName, count: 0, isNew: !known.has(h.packId) };
    pack.count++;
    packs.set(h.packId, pack);
  }
  const skipped = (
    [
      ['not-door-knock-allowed', mapped.skipped.notAllowed],
      ['no-coordinates', mapped.skipped.noCoords],
      ['no-pack', mapped.skipped.noPack],
      ['in-other-campaign', inOtherCampaign],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ reason, count }));
  const mdus = houses.filter((h) => h.unitOrder);
  return {
    ok: true,
    plan: {
      format,
      campaignId: opts.campaignId,
      rows: rows.length,
      houses,
      packs: [...packs.values()].sort((a, b) => naturalCompare(a.name, b.name)),
      skipped,
      duplicates,
      mdus: mdus.length,
      units: mdus.reduce((n, h) => n + (h.unitOrder?.length ?? 0), 0),
    },
  };
}
