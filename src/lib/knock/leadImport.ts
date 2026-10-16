// COPIED VERBATIM from 3c-knock-logic src/lib/leadImport.ts at commit f289f43
// (/home/fazetwerpnerd69/dev/3c-knock-logic/src/lib/leadImport.ts, LEAD_IMPORT_SPEC.md there).
// Do not edit here: change it in the app repo and copy it again, so the phone and the portal
// plan an import the same way. ./types.ts holds the types it imports.

/**
 * Lead-file import: CSV parsing, format detection, mapping of AT&T / SalesRabbit / other lead rows
 * to houses (packs, MDUs, contacts, notes, statuses), dedupe against a campaign's existing houses,
 * and the import plan the app (store `previewLeadImport` / `importLeads`) and
 * scripts/import-leads.ts write. Rows with a street address but no coordinates are placed by a
 * geocoder between `leadGeocodeRequests` and `planLeadImport` (network: geocode.ts).
 *
 * Pure and self-contained (no React Native, Firebase or other app modules; only a type import), so
 * the portal can copy this file as is. Spec: LEAD_IMPORT_SPEC.md.
 */
import type { Contact, Disposition, DoorNote, House, HouseDoc, NoteEdit, UnitState } from './types.ts';

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

/** A lead's status matched to a campaign result (LOGIC_REQUESTS #34): written as an imported mark. */
export interface LeadStatus {
  dispositionId: string;
  /** Not Home: the visit count the file gave ("Not Home 2" = 2, plain "Not Home" = 1); else 0. */
  notHomeCount: number;
  /** The file's Appointment (epoch ms), kept only when the result takes an appointment. */
  appointmentAt?: number;
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
  /** Contact from the source (single-family houses; MDU units use `unitContacts`). */
  contact?: Contact;
  unitContacts?: Record<string, Contact>;
  /** The source's Notes (trimmed, at most LEAD_NOTE_MAX characters): the door's note on import. */
  note?: string;
  /** MDU units' Notes, by unit label. */
  unitNoteTexts?: Record<string, string>;
  /** Status matched to a campaign result (single-family houses; MDU units use `unitStatuses`). */
  status?: LeadStatus;
  unitStatuses?: Record<string, LeadStatus>;
  /** "Assigned to (email)" from the source, lower case (an MDU: the one most of its rows name). */
  assignEmail?: string;
}
export interface LeadMapResult {
  houses: LeadHouse[];
  /**
   * Rows left out at mapping. `repeated`: the same door listed again (the same apartment of a
   * building, the same street address, or the same AT&T Living Unit ID). `notLocated`: a street
   * address but no coordinates, and the geocoder didn't place it (or wasn't asked). Every row is
   * either a house, an apartment of an MDU, or one of these.
   */
  skipped: { notAllowed: number; noCoords: number; noPack: number; repeated: number; notLocated: number };
}

const naturalCompare = new Intl.Collator('en', { numeric: true }).compare;

/**
 * Maps AT&T lead records to houses. Skips rows not door-knock-allowed, without coordinates or
 * without a pack. Rows sharing a building address (same street address + city) that carry a Unit
 * Number collapse into one MDU house, positioned at the first unit's coordinates.
 */
export function mapAttLeads(records: Record<string, string>[]): LeadMapResult {
  const skipped = { notAllowed: 0, noCoords: 0, noPack: 0, repeated: 0, notLocated: 0 };
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
    if (b.units.has(unit)) skipped.repeated++;
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
  const unique = houses.filter((h) => {
    if (!seen.has(h.id)) {
      seen.add(h.id);
      return true;
    }
    skipped.repeated += h.unitOrder?.length ?? 1;
    return false;
  });
  return { houses: unique, skipped };
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// ---------------------------------------------------------------------------------------------
// SalesRabbit and other lead files: columns by alias, contacts, statuses, geocoding hand-off.
// ---------------------------------------------------------------------------------------------

/** Lead-file fields the SalesRabbit / generic mapping reads, whatever the file calls them. */
export type LeadField =
  | 'lat'
  | 'lng'
  | 'address'
  | 'apt'
  | 'city'
  | 'state'
  | 'zip'
  | 'country'
  | 'firstName'
  | 'lastName'
  | 'name'
  | 'business'
  | 'phone'
  | 'email'
  | 'notes'
  | 'status'
  | 'assignedEmail'
  | 'appointment';

/** Header names per field, compared as `headerKey` (case, spaces and punctuation ignored). */
const FIELD_ALIASES: Record<LeadField, readonly string[]> = {
  lat: ['latitude', 'lat'],
  lng: ['longitude', 'lng', 'long', 'lon'],
  address: ['address', 'street', 'streetaddress', 'address1', 'addressline1'],
  apt: ['aptsuite', 'apt', 'suite', 'unit', 'unitnumber', 'apartment'],
  city: ['city', 'town'],
  state: ['state', 'stateregion', 'region', 'province'],
  zip: ['zip', 'zipcode', 'postalcode', 'postcode'],
  country: ['country'],
  firstName: ['firstname', 'first'],
  lastName: ['lastname', 'last'],
  name: ['name', 'fullname', 'contactname'],
  business: ['businessname', 'business', 'company', 'companyname'],
  phone: ['phone', 'mobile', 'phonenumber', 'mobilephone', 'cell', 'cellphone'],
  email: ['email', 'emailaddress'],
  notes: ['notes', 'note'],
  status: ['status', 'leadstatus'],
  assignedEmail: ['assignedtoemail', 'assignedemail', 'repemail'],
  appointment: ['appointment', 'appointmentdate', 'appointmenttime'],
};

const FIELD_OF_KEY = new Map<string, LeadField>(
  (Object.entries(FIELD_ALIASES) as [LeadField, readonly string[]][]).flatMap(([field, keys]) => keys.map((k) => [k, field] as const)),
);

/** How headers (and statuses) are compared: lower case, letters and digits only ("Postal Code" -> "postalcode"). */
export function headerKey(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** The header columns (as written) holding each field; a field several columns hold reads the first non-empty one. */
export function leadColumns(header: readonly string[]): Partial<Record<LeadField, string[]>> {
  const columns: Partial<Record<LeadField, string[]>> = {};
  for (const h of header) {
    const field = FIELD_OF_KEY.get(headerKey(h));
    if (field) (columns[field] ??= []).push(h.trim());
  }
  return columns;
}

/** Longest imported note: the door note limit (doorNotes.ts DOOR_NOTE_MAX; the rules allow the same). */
export const LEAD_NOTE_MAX = 1000;

/** Country values that mean the US (the geocoder is US only); blank counts as US. */
const US_COUNTRIES: Record<string, true> = { '': true, us: true, usa: true, unitedstates: true, unitedstatesofamerica: true };

/** A map location from the geocoder. `exact` false: it matched a nearby or partly different address. */
export interface LeadPoint {
  lat: number;
  lng: number;
  exact: boolean;
}

/** A street address to place on the map (a row without coordinates). `key`: `geocodeKey` of it. */
export interface LeadGeocodeRequest {
  key: string;
  street: string;
  city: string;
  state: string;
  zip: string;
}

/** Lookup key of an address: rows with the same street, city, state and ZIP share one lookup. */
export function geocodeKey(a: { street: string; city: string; state: string; zip: string }): string {
  return [a.street, a.city, a.state, a.zip].map((s) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()).join('|');
}

/** A row of a SalesRabbit / generic file, read through `leadColumns`. */
interface SrRow {
  lat: number;
  lng: number;
  hasCoords: boolean;
  apt: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  contact: Contact | null;
  note: string;
  status: string;
  assignEmail: string;
  appointment: string;
}

/** A person's name word typed all upper or all lower gets title case; "McDonald" stays as typed. */
function tidyName(s: string): string {
  return s
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? titleCase(w) : w))
    .join(' ');
}

function readSrRows(records: readonly Record<string, string>[]): SrRow[] {
  const columns = leadColumns(Object.keys(records[0] ?? {}));
  return records.map((r) => {
    const get = (field: LeadField) => {
      for (const c of columns[field] ?? []) {
        const v = (r[c] ?? '').trim();
        if (v !== '') return v;
      }
      return '';
    };
    const lat = Number.parseFloat(get('lat'));
    const lng = Number.parseFloat(get('lng'));
    const name = tidyName([get('firstName'), get('lastName')].filter(Boolean).join(' ')) || tidyName(get('name'));
    const contact: Contact = {
      ...(name ? { name } : {}),
      ...(get('business') ? { business: get('business') } : {}),
      ...(get('phone') ? { phone: get('phone') } : {}),
      ...(get('email') ? { email: get('email') } : {}),
    };
    return {
      lat,
      lng,
      hasCoords: Number.isFinite(lat) && Number.isFinite(lng) && !(lat === 0 && lng === 0),
      apt: get('apt').toUpperCase(),
      address: get('address').replace(/\s+/g, ' '),
      city: get('city'),
      state: get('state'),
      zip: get('zip'),
      country: get('country'),
      contact: Object.keys(contact).length > 0 ? contact : null,
      note: get('notes').slice(0, LEAD_NOTE_MAX).trim(),
      status: get('status'),
      assignEmail: get('assignedEmail').toLowerCase(),
      appointment: get('appointment'),
    };
  });
}

/** What the geocoder needs for a row: a street plus a city or ZIP, in the US. Null when it can't be looked up. */
function geocodeRequestOf(row: SrRow): LeadGeocodeRequest | null {
  if (!row.address || (!row.city && !row.zip) || US_COUNTRIES[headerKey(row.country)] !== true) return null;
  const req = { street: row.address, city: row.city, state: row.state, zip: row.zip };
  return { key: geocodeKey(req), ...req };
}

/** Statuses that name a campaign result differently (keys as `headerKey`): the default result id, then its kind. */
const STATUS_ALIASES: Record<string, { id: string; kind?: Disposition['kind']; sale?: true }> = {
  nothome: { id: 'not_home', kind: 'notHome' },
  notathome: { id: 'not_home', kind: 'notHome' },
  noanswer: { id: 'not_home', kind: 'notHome' },
  nh: { id: 'not_home', kind: 'notHome' },
  goback: { id: 'go_back' },
  callback: { id: 'go_back' },
  comeback: { id: 'go_back' },
  sold: { id: 'sold', sale: true },
  sale: { id: 'sold', sale: true },
  closed: { id: 'sold', sale: true },
  customer: { id: 'customer', kind: 'customer' },
  existingcustomer: { id: 'customer', kind: 'customer' },
  currentcustomer: { id: 'customer', kind: 'customer' },
  nosoliciting: { id: 'no_soliciting' },
  nosolicitation: { id: 'no_soliciting' },
  vacant: { id: 'vacant' },
};

/**
 * Matches a lead file's Status to one of the campaign's active results: by label or id (case,
 * spaces and punctuation ignored), else by STATUS_ALIASES ("Not Home", "Go Back", "Sold",
 * "Customer", ...). "Not Home 2" / "NH 3+" is Not Home with that visit count. Null = unmatched.
 */
export function leadStatusMatcher(
  dispositions: readonly Disposition[],
): (status: string) => { disposition: Disposition; notHomeCount: number } | null {
  const active = dispositions.filter((d) => d.archived !== true);
  const byKey = new Map<string, Disposition>();
  for (const d of active) {
    for (const k of [headerKey(d.label), headerKey(d.id)]) if (k && !byKey.has(k)) byKey.set(k, d);
  }
  const find = (key: string): Disposition | undefined => {
    const direct = byKey.get(key);
    if (direct) return direct;
    const alias = STATUS_ALIASES[key];
    if (!alias) return undefined;
    return (
      active.find((d) => d.id === alias.id) ??
      (alias.kind ? active.find((d) => d.kind === alias.kind) : undefined) ??
      (alias.sale ? active.find((d) => d.sale) : undefined)
    );
  };
  return (status) => {
    const key = headerKey(status);
    if (!key) return null;
    const d = find(key);
    if (d) return { disposition: d, notHomeCount: d.kind === 'notHome' ? 1 : 0 };
    const counted = /^(.*\D)(\d+)$/.exec(key);
    const nh = counted ? find(counted[1]) : undefined;
    return counted && nh?.kind === 'notHome' ? { disposition: nh, notHomeCount: Math.max(1, Number(counted[2])) } : null;
  };
}

/** Per-row tallies of a SalesRabbit / generic file (rows that became a house or apartment). */
interface LeadRowStats {
  geocoded: number;
  approximate: number;
  /** By `headerKey` of the status: the name as first written, the matched result (null = none), rows. */
  statuses: Map<string, { name: string; dispositionId: string | null; count: number }>;
  /** Rows per "Assigned to (email)" (lower case). */
  assignees: Map<string, number>;
  appointments: { kept: number; ignored: number };
  contacts: number;
  notes: number;
}

function emptyRowStats(): LeadRowStats {
  return { geocoded: 0, approximate: 0, statuses: new Map(), assignees: new Map(), appointments: { kept: 0, ignored: 0 }, contacts: 0, notes: 0 };
}

/** Rows of a SalesRabbit export within this distance with Apt/Suite values share one MDU. */
export const SR_MDU_RADIUS_M = 3;

/** SR pack grid: cells of ~2 km (0.018° lat ≈ 2.0 km; 0.022° lng ≈ 2.0 km at 33-36°N). */
const SR_PACK_LAT_DEG = 0.018;
const SR_PACK_LNG_DEG = 0.022;

/** Areas SR packs are named after (nearest centre within SR_AREA_RADIUS_M wins). */
const SR_AREAS = [
  { name: 'OKC', lat: 35.4676, lng: -97.5164 },
  { name: 'Dallas', lat: 32.7767, lng: -96.797 },
];
/** Packs farther than this from every SR_AREAS centre are named after their most common city. */
const SR_AREA_RADIUS_M = 150_000;

/** Options of the SalesRabbit / generic mapping. */
export interface SrMapOptions {
  /** The campaign's results, for the Status column (none = every status unmatched). */
  dispositions?: readonly Disposition[];
  /** Geocoder results by `LeadGeocodeRequest.key`; address rows without coordinates not in it are not located. */
  geocoded?: ReadonlyMap<string, LeadPoint>;
}

/**
 * Maps SalesRabbit (or other) lead records to houses. Position: the file's Latitude/Longitude,
 * else the geocoder's point for the street address (`opts.geocoded`). Rows with a street address
 * keep it (address + city); rows without one are `addressPending`. MDUs: rows with Apt/Suite at
 * the same street address, or (no address) within SR_MDU_RADIUS_M of each other; unitOrder is the
 * apt values. Contacts, notes and statuses ride along (per unit for MDUs). Houses are packed by
 * `packSrHouses`. Ids derive from the street address, else the coordinates, so re-imports of the
 * same file hit the same docs.
 */
export function mapSrLeads(records: Record<string, string>[], opts: SrMapOptions = {}): LeadMapResult {
  const { houses, skipped } = srLeadHouses(records, opts);
  packSrHouses(houses);
  return { houses, skipped };
}

/** What one accepted row brings to its door. */
interface RowData {
  contact?: Contact;
  note?: string;
  status?: LeadStatus;
  email?: string;
}

/** `mapSrLeads` without packs (packId/packName ''), so duplicates can be dropped before packing. */
function srLeadHouses(records: Record<string, string>[], opts: SrMapOptions): LeadMapResult & { stats: LeadRowStats } {
  const skipped = { notAllowed: 0, noCoords: 0, noPack: 0, repeated: 0, notLocated: 0 };
  const stats = emptyRowStats();
  const dispositions = opts.dispositions ?? [];
  const match = leadStatusMatcher(dispositions);
  const rows: (SrRow & { name: string })[] = [];
  for (const row of readSrRows(records)) {
    if (!row.hasCoords) {
      const req = geocodeRequestOf(row);
      const point = req ? opts.geocoded?.get(req.key) : undefined;
      if (!point) {
        if (row.address) skipped.notLocated++;
        else skipped.noCoords++;
        continue;
      }
      row.lat = point.lat;
      row.lng = point.lng;
      stats.geocoded++;
      if (!point.exact) stats.approximate++;
    }
    rows.push({ ...row, name: row.contact?.name ?? '' });
  }
  // Stable order makes clustering and id collisions independent of file order.
  rows.sort(
    (a, b) =>
      a.lat - b.lat ||
      a.lng - b.lng ||
      naturalCompare(a.apt, b.apt) ||
      naturalCompare(a.name, b.name) ||
      naturalCompare(a.address, b.address),
  );

  /** A row that becomes a door or apartment: its data, tallied. */
  const accept = (row: SrRow): RowData => {
    const data: RowData = {};
    if (row.contact) {
      data.contact = row.contact;
      stats.contacts++;
    }
    if (row.note) {
      data.note = row.note;
      stats.notes++;
    }
    if (row.assignEmail) {
      data.email = row.assignEmail;
      stats.assignees.set(row.assignEmail, (stats.assignees.get(row.assignEmail) ?? 0) + 1);
    }
    let takesAppointment = false;
    if (row.status) {
      const found = match(row.status);
      const key = headerKey(row.status);
      const entry = stats.statuses.get(key) ?? { name: row.status, dispositionId: found?.disposition.id ?? null, count: 0 };
      entry.count++;
      stats.statuses.set(key, entry);
      if (found) {
        data.status = { dispositionId: found.disposition.id, notHomeCount: found.notHomeCount };
        takesAppointment = found.disposition.appointment;
      }
    }
    if (row.appointment) {
      const at = Date.parse(row.appointment);
      if (data.status && takesAppointment && Number.isFinite(at)) {
        data.status.appointmentAt = at;
        stats.appointments.kept++;
      } else stats.appointments.ignored++;
    }
    return data;
  };

  const houses: LeadHouse[] = [];
  const singlesByAddress = new Set<string>();
  type Building = { lat: number; lng: number; address: string; city: string; addressKey: string; units: Map<string, RowData> };
  const buildings: Building[] = [];
  const buildingsByAddress = new Map<string, Building>();
  // Address-less buildings: grid cells of ~11 m so a neighbour search only checks the 3x3 block around a row.
  const cell = (v: number) => Math.floor(v * 10_000);
  const grid = new Map<string, Building[]>();
  for (const row of rows) {
    const addressKey = row.address ? normalizeAddress(row.address, row.city || row.zip) : '';
    const located = row.address ? { address: row.address, city: row.city } : { address: '', city: '', addressPending: true as const };
    if (!row.apt) {
      if (addressKey && singlesByAddress.has(addressKey)) {
        skipped.repeated++;
        continue;
      }
      if (addressKey) singlesByAddress.add(addressKey);
      const data = accept(row);
      houses.push({
        id: addressKey ? `lead-${slug(addressKey)}` : '',
        packId: '',
        packName: '',
        ...located,
        lat: row.lat,
        lng: row.lng,
        unitOrder: null,
        ...(data.contact ? { contact: data.contact } : {}),
        ...(data.note ? { note: data.note } : {}),
        ...(data.status ? { status: data.status } : {}),
        ...(data.email ? { assignEmail: data.email } : {}),
      });
      continue;
    }
    let found: Building | undefined;
    if (addressKey) found = buildingsByAddress.get(addressKey);
    else {
      for (let dy = -1; dy <= 1 && !found; dy++) {
        for (let dx = -1; dx <= 1 && !found; dx++) {
          found = grid
            .get(`${cell(row.lat) + dy}:${cell(row.lng) + dx}`)
            ?.find((b) => distanceMeters(b, row) <= SR_MDU_RADIUS_M);
        }
      }
    }
    if (found) {
      if (found.units.has(row.apt)) skipped.repeated++;
      else found.units.set(row.apt, accept(row));
      continue;
    }
    const b: Building = { lat: row.lat, lng: row.lng, address: row.address, city: row.city, addressKey, units: new Map([[row.apt, accept(row)]]) };
    buildings.push(b);
    if (addressKey) buildingsByAddress.set(addressKey, b);
    else {
      const key = `${cell(row.lat)}:${cell(row.lng)}`;
      grid.set(key, [...(grid.get(key) ?? []), b]);
    }
  }
  for (const b of buildings) {
    const unitOrder = [...b.units.keys()].sort(naturalCompare);
    const pick = <T>(f: (d: RowData) => T | undefined): Record<string, T> | undefined => {
      const out: Record<string, T> = {};
      for (const u of unitOrder) {
        const v = f(b.units.get(u) as RowData);
        if (v !== undefined) out[u] = v;
      }
      return Object.keys(out).length > 0 ? out : undefined;
    };
    const unitContacts = pick((d) => d.contact);
    const unitNoteTexts = pick((d) => d.note);
    const unitStatuses = pick((d) => d.status);
    const emails = new Map<string, number>();
    for (const d of b.units.values()) if (d.email) emails.set(d.email, (emails.get(d.email) ?? 0) + 1);
    const assignEmail = [...emails].sort(([ea, a], [eb, bc]) => bc - a || ea.localeCompare(eb))[0]?.[0];
    houses.push({
      id: b.addressKey ? `lead-mdu-${slug(b.addressKey)}` : '',
      packId: '',
      packName: '',
      ...(b.address ? { address: b.address, city: b.city } : { address: '', city: '', addressPending: true as const }),
      lat: b.lat,
      lng: b.lng,
      unitOrder,
      ...(unitContacts ? { unitContacts } : {}),
      ...(unitNoteTexts ? { unitNoteTexts } : {}),
      ...(unitStatuses ? { unitStatuses } : {}),
      ...(assignEmail ? { assignEmail } : {}),
    });
  }
  const used = new Set(houses.map((h) => h.id).filter(Boolean));
  for (const h of houses) {
    if (h.id) continue;
    const stem = `att-sr-${h.unitOrder ? 'mdu-' : ''}${slug(`${h.lat.toFixed(6)} ${h.lng.toFixed(6)}`)}`;
    let id = stem;
    for (let n = 2; used.has(id); n++) id = `${stem}-${n}`;
    used.add(id);
    h.id = id;
  }
  return { houses, skipped, stats };
}

/** The SR pack grid cell (~2 km) a point falls in. */
function srPackCell(p: { lat: number; lng: number }): string {
  return `${Math.floor(p.lat / SR_PACK_LAT_DEG)}:${Math.floor(p.lng / SR_PACK_LNG_DEG)}`;
}

/**
 * Sets packId/packName on SalesRabbit houses (in place): one pack per ~2 km grid cell, packId
 * `att-sr-<n>` numbered biggest cell first, packName 'SR <area> <k>' numbered per area (area: the
 * nearest SR_AREAS centre within SR_AREA_RADIUS_M, else the cell's most common city). With the
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
        const nearest = SR_AREAS.reduce((best, a) =>
          distanceMeters({ lat, lng }, a) < distanceMeters({ lat, lng }, best) ? a : best,
        );
        const area = distanceMeters({ lat, lng }, nearest) <= SR_AREA_RADIUS_M ? nearest.name : (commonCity(members) ?? 'Leads');
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

/** The city most of these houses name (ties: alphabetical); null when none has one. */
function commonCity(houses: readonly LeadHouse[]): string | null {
  const counts = new Map<string, number>();
  for (const h of houses) if (h.city) counts.set(h.city, (counts.get(h.city) ?? 0) + 1);
  return [...counts].sort(([ca, a], [cb, b]) => b - a || ca.localeCompare(cb))[0]?.[0] ?? null;
}

/**
 * A fresh house doc for a lead house. A matched status becomes an imported mark (`last` or the
 * unit's, `imported: true`, `knockId` '', `repId` = `by`, at `now`; Not Home with its visit count),
 * never a knock. Notes become door notes by `by` at `now`; contacts are copied. Else unknocked.
 */
export function leadHouseDoc(
  h: LeadHouse,
  opts: { campaignId: string; assignedRepId: string | null; managerId: string | null; now: number; by: string },
): HouseDoc {
  const state = (s: LeadStatus): UnitState => ({
    last: {
      dispositionId: s.dispositionId,
      at: opts.now,
      repId: opts.by,
      knockId: '',
      imported: true,
      ...(s.appointmentAt !== undefined ? { appointmentAt: s.appointmentAt } : {}),
    },
    notHomeCount: s.notHomeCount,
  });
  const note = (text: string): DoorNote => ({ text, by: opts.by, at: opts.now });
  const door = h.status ? state(h.status) : { last: null, notHomeCount: 0 };
  const unitNotes = h.unitNoteTexts
    ? Object.fromEntries(Object.entries(h.unitNoteTexts).map(([u, text]) => [u, note(text)]))
    : undefined;
  const notedUnit = h.unitOrder?.find((u) => h.unitNoteTexts?.[u]);
  const noteEdit: NoteEdit | undefined =
    h.note || notedUnit !== undefined ? { unit: h.note ? null : (notedUnit as string), by: opts.by, at: opts.now } : undefined;
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
    last: door.last,
    notHomeCount: door.notHomeCount,
    unitOrder: h.unitOrder,
    units: h.unitOrder ? Object.fromEntries(Object.entries(h.unitStatuses ?? {}).map(([u, s]) => [u, state(s)])) : null,
    movedBy: null,
    createdBy: null,
    updatedAt: opts.now,
    ...(h.addressPending ? { addressPending: true as const } : {}),
    ...(h.contact ? { contact: h.contact } : {}),
    ...(h.unitContacts ? { unitContacts: h.unitContacts } : {}),
    ...(h.note ? { doorNote: note(h.note) } : {}),
    ...(unitNotes ? { unitNotes } : {}),
    ...(noteEdit ? { noteEdit } : {}),
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
// Import plan (app, portal and scripts/import-leads.ts): detect, geocode hand-off, map, drop
// duplicates, pack, assign.
// ---------------------------------------------------------------------------------------------

/**
 * 'att': AT&T lead list (street address, PSA pack). 'sr': SalesRabbit export or SalesRabbit+
 * import file. 'generic': any other file with coordinates or a street address + city/ZIP. 'sr' and
 * 'generic' map the same way (`mapSrLeads`); the name only tells the preview what it saw.
 */
export type LeadFormat = 'att' | 'sr' | 'generic';

/**
 * The format of a lead file from its header row. AT&T: the exact columns Latitude, Longitude, Door
 * Knock Allowed and PSA. Else any file with coordinate columns (Latitude/Lat + Longitude/Lng/Long)
 * or a street address column plus City or ZIP (headers matched by `headerKey` and FIELD_ALIASES):
 * 'sr' when it has SalesRabbit's Apt/Suite or Assigned to (email) + Status, else 'generic'.
 * Null when it has neither coordinates nor an address.
 */
export function detectLeadFormat(header: readonly string[]): LeadFormat | null {
  const exact = new Set(header.map((h) => h.trim()));
  if (exact.has('Latitude') && exact.has('Longitude') && exact.has('Door Knock Allowed') && exact.has('PSA')) return 'att';
  const c = leadColumns(header);
  if (!(c.lat && c.lng) && !(c.address && (c.city || c.zip))) return null;
  const keys = new Set(header.map(headerKey));
  return keys.has('aptsuite') || (c.assignedEmail && c.status) ? 'sr' : 'generic';
}

type LeadFile =
  | { ok: true; format: LeadFormat; rows: string[][]; records: Record<string, string>[] }
  | { ok: false; reason: 'empty' | 'unknown-format' };

function readLeadFile(text: string, format: LeadFormat | undefined): LeadFile {
  const [header, ...rows] = parseCsv(text);
  if (!header || rows.length === 0) return { ok: false, reason: 'empty' };
  const detected = format ?? detectLeadFormat(header);
  if (!detected) return { ok: false, reason: 'unknown-format' };
  return { ok: true, format: detected, rows, records: toRecords(header, rows) };
}

export type LeadGeocodeResult =
  | { ok: true; format: LeadFormat; requests: LeadGeocodeRequest[] }
  | { ok: false; reason: 'empty' | 'unknown-format' };

/**
 * Step 1 of a preview: the street addresses to geocode (rows without coordinates that have a
 * street plus city or ZIP and a US or blank country), one per distinct address. AT&T files never
 * need any. Pass the geocoder's points (by `key`) to `planLeadImport` as `geocoded`.
 */
export function leadGeocodeRequests(text: string, opts: { format?: LeadFormat } = {}): LeadGeocodeResult {
  const file = readLeadFile(text, opts.format);
  if (!file.ok) return file;
  if (file.format === 'att') return { ok: true, format: file.format, requests: [] };
  const requests = new Map<string, LeadGeocodeRequest>();
  for (const row of readSrRows(file.records)) {
    if (row.hasCoords) continue;
    const req = geocodeRequestOf(row);
    if (req && !requests.has(req.key)) requests.set(req.key, req);
  }
  return { ok: true, format: file.format, requests: [...requests.values()] };
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

export interface LeadDedupe<T extends LeadHouse = LeadHouse> {
  kept: T[];
  /** Leads that are already doors in this campaign. */
  duplicates: number;
}

/**
 * A lead's house doc id in a campaign. Scoped by campaign so the same door can be in two campaigns
 * (each keeps its own houses and marks) and an import never needs to look at other campaigns.
 */
export function leadDocId(campaignId: string, leadId: string): string {
  return `${campaignId}__${leadId}`;
}

/**
 * Drops leads that are already doors of this campaign: the same id, the same normalized address,
 * or within DUPLICATE_RADIUS_M (see there). Doors of other campaigns are ignored.
 */
export function dedupeLeads<T extends LeadHouse>(leads: readonly T[], existing: readonly House[], campaignId: string): LeadDedupe<T> {
  const mine = existing.filter((h) => h.campaignId === campaignId);
  const ids = new Set(mine.map((h) => h.id));
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

  const kept: T[] = [];
  let duplicates = 0;
  for (const lead of leads) {
    const key = normalizeAddress(lead.address, lead.city);
    let duplicate = ids.has(lead.id) || (key !== '' && addresses.has(key));
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
  return { kept, duplicates };
}

export type LeadSkipReason = 'not-door-knock-allowed' | 'no-coordinates' | 'not-located' | 'no-pack' | 'repeated-row';

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
  /** Ready-to-write docs (`updatedAt` = plan time), in file mapping order. */
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
  /**
   * Where the file's rows went, before dropping doors already in the campaign: `houseRows` became
   * one house each; `apartmentRows` became apartments of `buildings` MDUs (many rows, one door
   * each building). rows = houseRows + apartmentRows + the row reasons in `skipped`.
   */
  rowsBreakdown: { houseRows: number; apartmentRows: number; buildings: number };
  /** Rows placed on the map by the geocoder; `approximate` of them matched a nearby or partly different address. */
  geocoded: number;
  approximate: number;
  /** Rows with a street address but no map location (not US, no city/ZIP, no geocoder match, or not geocoded); also in `skipped`. */
  notLocated: number;
  /**
   * The file's statuses that matched a campaign result, rows each (most first). Those doors /
   * units get an imported mark (no knock, never counted as a visit).
   */
  statuses: { name: string; dispositionId: string; count: number }[];
  /** Statuses that matched no result, rows each (most first): those doors import unknocked. */
  unmatchedStatuses: { name: string; count: number }[];
  /** `assignTo` 'from the file' only: emails that matched a user, rows each (most first). */
  assignees: { email: string; repId: string; count: number }[];
  /** `assignTo` 'from the file' only: emails that matched nobody, rows each: those doors import unassigned. */
  unmatchedAssignees: { email: string; count: number }[];
  /** Different "Assigned to (email)" values in the file (whatever `assignTo` is), so the screen can offer "From the file". */
  fileAssignees: number;
  /** Appointment cells kept on the imported mark, and ignored (no matched status that takes one, or not a date). */
  appointments: { kept: number; ignored: number };
  /** Rows with a contact (name, business, phone or email) and with a note. */
  contacts: number;
  notes: number;
}

/** A user an "Assigned to (email)" can name. */
export interface LeadRep {
  uid: string;
  email: string;
  managerId: string | null;
}

export interface LeadPlanOptions {
  campaignId: string;
  /** Houses already on the server (and queued) in `campaignId`; doors of other campaigns are ignored. */
  existing: readonly House[];
  /** The importing user's uid: `repId` of imported marks and `by` of imported notes. */
  by: string;
  /** The campaign's results, for the Status column (missing = every status unmatched). */
  dispositions?: readonly Disposition[];
  /**
   * Who the houses go to: one rep (with that rep's manager), or each door to the user its
   * "Assigned to (email)" names (`fromFile`: the users to look emails up in; unknown or blank =
   * unassigned). Omitted/null = unassigned.
   */
  assignTo?: { repId: string; managerId: string | null } | { fromFile: readonly LeadRep[] } | null;
  /** Geocoder points by `LeadGeocodeRequest.key` (`leadGeocodeRequests`); missing = no address rows located. */
  geocoded?: ReadonlyMap<string, LeadPoint>;
  /** Skips header detection. */
  format?: LeadFormat;
  now?: number;
}

export type LeadPlanResult = { ok: true; plan: LeadImportPlan } | { ok: false; reason: 'empty' | 'unknown-format' };

/**
 * What importing this CSV into the campaign would write: detects the format, maps rows to houses
 * (AT&T: PSA packs, MDUs by building; SR / generic: ~2 km packs continuing the campaign's SR pack
 * numbers, MDUs by address or 3 m apt clusters, the file's address or `addressPending`, contacts,
 * notes, statuses), gives them campaign-scoped ids (`leadDocId`), drops leads already in the
 * campaign, and assigns them. Nothing is written.
 */
export function planLeadImport(text: string, opts: LeadPlanOptions): LeadPlanResult {
  const file = readLeadFile(text, opts.format);
  if (!file.ok) return file;
  const { format, rows, records } = file;
  const mapped =
    format === 'att'
      ? { ...mapAttLeads(records), stats: emptyRowStats() }
      : srLeadHouses(records, { dispositions: opts.dispositions, geocoded: opts.geocoded });
  const scoped = mapped.houses.map((h) => ({ ...h, id: leadDocId(opts.campaignId, h.id) }));
  const { kept, duplicates } = dedupeLeads(scoped, opts.existing, opts.campaignId);
  const mine = opts.existing.filter((h) => h.campaignId === opts.campaignId);
  if (format !== 'att') packSrHouses(kept, mine);

  const now = opts.now ?? Date.now();
  const assignTo = opts.assignTo ?? null;
  const byEmail = assignTo && 'fromFile' in assignTo ? new Map(assignTo.fromFile.map((r) => [r.email.trim().toLowerCase(), r])) : null;
  const assignee = (h: LeadHouse): { repId: string; managerId: string | null } | null => {
    if (!assignTo) return null;
    if ('repId' in assignTo) return assignTo;
    const rep = h.assignEmail ? byEmail?.get(h.assignEmail) : undefined;
    return rep ? { repId: rep.uid, managerId: rep.managerId } : null;
  };
  const houses: House[] = kept.map((h) => {
    const a = assignee(h);
    return {
      id: h.id,
      ...leadHouseDoc(h, { campaignId: opts.campaignId, assignedRepId: a?.repId ?? null, managerId: a?.managerId ?? null, now, by: opts.by }),
    };
  });
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
      ['not-located', mapped.skipped.notLocated],
      ['no-pack', mapped.skipped.noPack],
      ['repeated-row', mapped.skipped.repeated],
    ] as const
  )
    .filter(([, count]) => count > 0)
    .map(([reason, count]) => ({ reason, count }));
  const mdus = houses.filter((h) => h.unitOrder);
  const mappedMdus = mapped.houses.filter((h) => h.unitOrder);
  const { stats } = mapped;
  const mostFirst = <T extends { count: number }>(list: T[], name: (x: T) => string) =>
    list.sort((a, b) => b.count - a.count || naturalCompare(name(a), name(b)));
  const statusList = [...stats.statuses.values()];
  const emailList = [...stats.assignees].map(([email, count]) => ({ email, count, rep: byEmail?.get(email) }));
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
      rowsBreakdown: {
        houseRows: mapped.houses.length - mappedMdus.length,
        apartmentRows: mappedMdus.reduce((n, h) => n + (h.unitOrder?.length ?? 0), 0),
        buildings: mappedMdus.length,
      },
      geocoded: stats.geocoded,
      approximate: stats.approximate,
      notLocated: mapped.skipped.notLocated,
      statuses: mostFirst(
        statusList.flatMap((s) => (s.dispositionId ? [{ name: s.name, dispositionId: s.dispositionId, count: s.count }] : [])),
        (s) => s.name,
      ),
      unmatchedStatuses: mostFirst(
        statusList.flatMap((s) => (s.dispositionId ? [] : [{ name: s.name, count: s.count }])),
        (s) => s.name,
      ),
      assignees: byEmail
        ? mostFirst(
            emailList.flatMap((e) => (e.rep ? [{ email: e.email, repId: e.rep.uid, count: e.count }] : [])),
            (e) => e.email,
          )
        : [],
      unmatchedAssignees: byEmail
        ? mostFirst(
            emailList.flatMap((e) => (e.rep ? [] : [{ email: e.email, count: e.count }])),
            (e) => e.email,
          )
        : [],
      fileAssignees: stats.assignees.size,
      appointments: stats.appointments,
      contacts: stats.contacts,
      notes: stats.notes,
    },
  };
}
