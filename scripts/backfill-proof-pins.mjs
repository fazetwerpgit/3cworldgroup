// One-time backfill of the 3C Doors "Booked nearby" / "Went solar" pins
// (proofPins/{houseId}; src/lib/solar/proofPins.ts, 3c-knock
// docs/design/NEARBY_LEADS.md option B) for doors booked or sold before the
// app and the portal started writing them.
//
//   node scripts/backfill-proof-pins.mjs [--env-dir DIR]           -> DRY RUN (default): reads only
//   node scripts/backfill-proof-pins.mjs [--env-dir DIR] --apply   -> write the pins
//
// --env-dir: where .env.local lives (a git worktree has none; point it at the
// main checkout). Defaults to the current directory.
//
// What it writes, on solar campaigns only (campaigns/{id}.type == 'solar', as
// the app only pins solar doors):
//   - 'solar' for a door whose solar lead (solarLeads.doorId == the house id)
//     reads as sold (status 'sold', or a sale / later sales stage), at = the
//     sold time (statusChangedAt, else the first closing stage entry, else
//     stageChangedAt / updatedAt / createdAt);
//   - 'booked' for a door whose own mark is Appointment Booked
//     (last.dispositionId == 'appointment_set', not a lead-file import), at =
//     that mark's time.
// Exactly six fields: {campaignId, cell (geohash-5), lat, lng (3 decimals, ~110 m),
// kind, at (ms)}, campaign and position from the door.
//
// Skipped: doors of QA test / demo accounts (users/{uid}.testAccount or
// demoAccount on the door's rep or the mark's rep; a lead stamped testAccount),
// doors with no usable position, and doors on non-solar campaigns.
//
// Idempotent: a pin that already matches is left alone; a 'solar' pin is never
// turned back to 'booked' and keeps its time. Nothing is deleted.
// Output: counts per campaign and kind only (no names, addresses or uids).
import { createRequire } from 'node:module';
import path from 'node:path';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const envDirIndex = argv.indexOf('--env-dir');
const envDir = path.resolve(envDirIndex >= 0 && argv[envDirIndex + 1] ? argv[envDirIndex + 1] : process.cwd());
const require = createRequire(process.cwd() + '/');

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(envDir);

// House pattern: FIREBASE_SERVICE_ACCOUNT only (base64 or raw JSON).
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error(`FIREBASE_SERVICE_ACCOUNT is not set (env dir: ${envDir}); cannot authenticate.`);
  process.exit(1);
}
let serviceAccount;
try {
  const trimmed = raw.trim();
  serviceAccount = trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : JSON.parse(Buffer.from(trimmed.replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('utf-8'));
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT is neither base64 JSON nor JSON.');
  process.exit(1);
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ credential: cert(serviceAccount) }, 'backfill-proof-pins');
const db = getFirestore(app);

// ---- Kept in step with src/lib/solar/proofPins.ts, src/lib/knock/area/geohash.ts,
// ---- src/lib/solar/leadStage.ts (isClosedStage / readStage) and closePermission.ts (isSoldLead).
const BOOKED_RESULT = 'appointment_set';
const BASE32 = '0123456789bcdefghjkmnpqrstuvwxyz';
const LATER_STAGES = ['site_survey', 'permit_approved', 'install_scheduled', 'install_complete', 'pto'];

function geohashEncode(lat, lng, precision = 5) {
  let latLo = -90, latHi = 90, lngLo = -180, lngHi = 180;
  let hash = '', bits = 0, value = 0, evenBit = true;
  while (hash.length < precision) {
    if (evenBit) {
      const mid = (lngLo + lngHi) / 2;
      if (lng >= mid) { value = value * 2 + 1; lngLo = mid; } else { value *= 2; lngHi = mid; }
    } else {
      const mid = (latLo + latHi) / 2;
      if (lat >= mid) { value = value * 2 + 1; latLo = mid; } else { value *= 2; latHi = mid; }
    }
    evenBit = !evenBit;
    if (++bits === 5) { hash += BASE32[value]; bits = 0; value = 0; }
  }
  return hash;
}

const roundCoord = (v) => Math.round(v * 1e3) / 1e3 + 0;

function pinDoc(house, kind, at) {
  const { campaignId, lat, lng } = house;
  if (typeof campaignId !== 'string' || !campaignId) return null;
  if (typeof lat !== 'number' || typeof lng !== 'number' || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  if (!Number.isFinite(at) || at <= 0) return null;
  const rLat = roundCoord(lat);
  const rLng = roundCoord(lng);
  return { campaignId, cell: geohashEncode(rLat, rLng, 5), lat: rLat, lng: rLng, kind, at: Math.round(at) };
}

function isSoldLead(d) {
  if (d.status === 'sold') return true;
  if (LATER_STAGES.includes(d.stage)) return true;
  return d.stage === 'appointment_demoed' && d.stageOutcome === 'sale';
}

function toMillis(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.getTime();
  if (v && typeof v.toMillis === 'function') return toMillis(v.toMillis());
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : t; }
  return null;
}

/** When the lead was sold, best effort. */
function soldAt(d) {
  if (d.status === 'sold' && toMillis(d.statusChangedAt)) return toMillis(d.statusChangedAt);
  const history = Array.isArray(d.stageHistory) ? d.stageHistory : [];
  const closing = history.find((e) => e && (LATER_STAGES.includes(e.stage) || (e.stage === 'appointment_demoed' && e.outcome === 'sale')));
  return toMillis(closing?.at) ?? toMillis(d.stageChangedAt) ?? toMillis(d.statusChangedAt) ?? toMillis(d.updatedAt) ?? toMillis(d.createdAt);
}

function bookedMarkAt(house) {
  const last = house.last;
  if (!last || typeof last !== 'object' || last.dispositionId !== BOOKED_RESULT || last.imported === true) return null;
  return typeof last.at === 'number' && Number.isFinite(last.at) && last.at > 0 ? last.at : null;
}

const samePin = (a, b) => !!a && !!b && ['campaignId', 'cell', 'lat', 'lng', 'kind', 'at'].every((k) => a[k] === b[k])
  && Object.keys(a).length === 6;
const DOC_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

// ---- Read
console.log(apply ? 'APPLY: writing proof pins\n' : 'DRY RUN: nothing is written (pass --apply to write)\n');

const campaigns = (await db.collection('campaigns').get()).docs;
const solarCampaigns = new Map(campaigns.filter((c) => c.get('type') === 'solar').map((c) => [c.id, String(c.get('name') ?? '')]));

const hiddenUsers = new Set(
  (await db.collection('users').get()).docs
    .filter((u) => u.get('testAccount') === true || u.get('demoAccount') === true)
    .map((u) => u.id),
);

// Booked doors, per solar campaign.
const houses = new Map(); // id -> data
for (const campaignId of solarCampaigns.keys()) {
  let snap;
  try {
    snap = await db.collection('houses').where('campaignId', '==', campaignId).where('last.dispositionId', '==', BOOKED_RESULT).get();
  } catch (error) {
    console.warn(`  (campaign ${campaignId}: filtered query failed, scanning the campaign: ${error.code ?? error.message})`);
    snap = await db.collection('houses').where('campaignId', '==', campaignId).get();
  }
  for (const h of snap.docs) houses.set(h.id, h.data());
}

// Sold leads linked to a door.
const soldByHouse = new Map(); // houseId -> {at, test}
const leads = (await db.collection('solarLeads').get()).docs;
let leadsWithDoor = 0;
for (const l of leads) {
  const d = l.data();
  if (typeof d.doorId !== 'string' || !DOC_ID_RE.test(d.doorId)) continue;
  leadsWithDoor++;
  if (!isSoldLead(d)) continue;
  const test = d.testAccount === true || hiddenUsers.has(d.repUid);
  const prev = soldByHouse.get(d.doorId);
  const at = soldAt(d);
  if (!prev || (at && (!prev.at || at < prev.at))) soldByHouse.set(d.doorId, { at, test: test || !!prev?.test });
}
const missingHouseIds = [...soldByHouse.keys()].filter((id) => !houses.has(id));
for (let i = 0; i < missingHouseIds.length; i += 100) {
  const refs = missingHouseIds.slice(i, i + 100).map((id) => db.collection('houses').doc(id));
  for (const s of await db.getAll(...refs)) if (s.exists) houses.set(s.id, s.data());
}

// ---- Plan
const counts = new Map(); // campaignId -> {booked:{create,update,same}, solar:{...}}
const skipped = { testAccount: 0, noPosition: 0, notSolarCampaign: 0, soldLeadDoorMissing: 0, notBooked: 0, soldNoTime: 0 };
const bump = (campaignId, kind, what) => {
  if (!counts.has(campaignId)) counts.set(campaignId, { booked: { create: 0, update: 0, same: 0 }, solar: { create: 0, update: 0, same: 0 } });
  counts.get(campaignId)[kind][what]++;
};
skipped.soldLeadDoorMissing = missingHouseIds.filter((id) => !houses.has(id)).length;

const plan = []; // {id, pin}
const ids = [...houses.keys()];
const existing = new Map();
for (let i = 0; i < ids.length; i += 100) {
  const refs = ids.slice(i, i + 100).map((id) => db.collection('proofPins').doc(id));
  for (const s of await db.getAll(...refs)) if (s.exists) existing.set(s.id, s.data());
}

for (const [id, house] of houses) {
  if (!solarCampaigns.has(house.campaignId)) { skipped.notSolarCampaign++; continue; }
  const sold = soldByHouse.get(id);
  const repIds = [house.assignedRepId, house.last?.repId, house.createdBy].filter((v) => typeof v === 'string' && v);
  if (repIds.some((u) => hiddenUsers.has(u)) || sold?.test) { skipped.testAccount++; continue; }
  const have = existing.get(id);
  let pin = null;
  if (sold) {
    if (!sold.at) { skipped.soldNoTime++; continue; }
    // A solar pin already there keeps its time.
    pin = have?.kind === 'solar' ? pinDoc(house, 'solar', have.at) : pinDoc(house, 'solar', sold.at);
  } else {
    const at = bookedMarkAt(house);
    if (at === null) { skipped.notBooked++; continue; }
    if (have?.kind === 'solar') { bump(house.campaignId, 'solar', 'same'); continue; }
    pin = pinDoc(house, 'booked', at);
  }
  if (!pin) { skipped.noPosition++; continue; }
  const what = !have ? 'create' : samePin(have, pin) ? 'same' : 'update';
  bump(pin.campaignId, pin.kind, what);
  if (what !== 'same') plan.push({ id, pin });
}

// ---- Report (counts only)
console.log(`Solar campaigns: ${solarCampaigns.size}; booked doors read: ${houses.size}; solar leads: ${leads.length} (${leadsWithDoor} linked to a door, ${soldByHouse.size} doors with a sold lead)\n`);
for (const [campaignId, c] of [...counts.entries()].sort()) {
  const name = solarCampaigns.get(campaignId) || '';
  console.log(`${campaignId}${name ? ` (${name})` : ''}`);
  for (const kind of ['booked', 'solar']) {
    const k = c[kind];
    console.log(`  ${kind.padEnd(6)}  create ${k.create}  update ${k.update}  unchanged ${k.same}`);
  }
}
const total = (kind, what) => [...counts.values()].reduce((n, c) => n + c[kind][what], 0);
console.log(`\nTotal: booked create ${total('booked', 'create')} update ${total('booked', 'update')} unchanged ${total('booked', 'same')}; ` +
  `solar create ${total('solar', 'create')} update ${total('solar', 'update')} unchanged ${total('solar', 'same')}`);
console.log(`Skipped: ${Object.entries(skipped).map(([k, v]) => `${k} ${v}`).join(', ')}`);

// ---- Write
if (apply && plan.length) {
  for (let i = 0; i < plan.length; i += 400) {
    const batch = db.batch();
    for (const { id, pin } of plan.slice(i, i + 400)) batch.set(db.collection('proofPins').doc(id), pin);
    await batch.commit();
  }
  console.log(`\nWrote ${plan.length} pins.`);
} else {
  console.log(apply ? '\nNothing to write.' : `\nDry run complete: ${plan.length} pins would be written. Re-run with --apply to write.`);
}
process.exit(0);
