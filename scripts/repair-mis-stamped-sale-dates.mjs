// Repair sale dates mis-stamped by the create-path bug (spec W5).
//
// A sale created through the portal form never sent `saleDate`, so the API
// stamped it with the upload time. A rep back-entering August work therefore
// has an August install on a sale dated today. An install can never precede
// the sale, so `installDate < saleDate` (compared on the calendar DAY) is
// proof of a mis-stamp, and the repair is `saleDate = installDate`.
//
// Untouched on purpose: sales with no installDate (nothing to compare), and
// sales where the install is on or after the sale date — sold-in-August /
// installs-in-September is the NORMAL case. Cancelled and rejected sales are
// reported separately and never written.
//
//   node scripts/repair-mis-stamped-sale-dates.mjs           -> DRY RUN (default, writes nothing)
//   node scripts/repair-mis-stamped-sale-dates.mjs --apply   -> write the repairs
//
// There is no env var, config file or prompt that enables writes: the --apply
// flag on the command line is the only way.
//
// Dates are stored at LOCAL NOON (see src/lib/sales/saleDate.ts), so the new
// saleDate is built at local noon of the install day rather than copying the
// install timestamp verbatim — same calendar day, house storage convention.
import nextEnv from '@next/env'; // CommonJS: no named ESM exports
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, Timestamp, FieldValue } from 'firebase-admin/firestore';

const { loadEnvConfig } = nextEnv;

const apply = process.argv.includes('--apply');
const BATCH_LIMIT = 400; // Firestore caps a batch at 500; leave headroom.

loadEnvConfig(process.cwd());

// House pattern: FIREBASE_SERVICE_ACCOUNT only. FIREBASE_ADMIN_PRIVATE_KEY is
// truncated in every environment here and must not be used.
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set — cannot authenticate.');
  process.exit(1);
}
const b64 = raw.replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
const credential = cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')));
initializeApp({ credential });
const db = getFirestore();

/** Firestore Timestamp | Date | ISO string -> Date, else null. */
function toDate(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate();
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** Local calendar day as YYYY-MM-DD — the resolution the comparison runs at. */
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Local noon of the same calendar day, matching parseSaleDateInput. */
function localNoon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
}

const snap = await db.collection('sales').get();

const affected = [];
const skippedStatus = []; // would qualify, but cancelled/rejected
let noInstallDate = 0;
let noSaleDate = 0;
let consistent = 0;

for (const doc of snap.docs) {
  const data = doc.data();
  const saleDate = toDate(data.saleDate);
  const installDate = toDate(data.installDate);

  if (!saleDate) {
    noSaleDate += 1;
    continue;
  }
  if (!installDate) {
    noInstallDate += 1;
    continue;
  }

  const saleDay = dayKey(saleDate);
  const installDay = dayKey(installDate);
  if (installDay >= saleDay) {
    consistent += 1;
    continue;
  }

  const row = {
    id: doc.id,
    ref: doc.ref,
    repName: String(data.salesRepName ?? '?'),
    customerName: String(data.customerName ?? data.customerAddress ?? '?'),
    status: String(data.status ?? '?'),
    saleDay,
    installDay,
    proposed: localNoon(installDate),
  };

  if (row.status === 'cancelled' || row.status === 'rejected') {
    skippedStatus.push(row);
    continue;
  }
  affected.push(row);
}

const byRepThenDate = (a, b) =>
  a.repName.localeCompare(b.repName) || a.saleDay.localeCompare(b.saleDay) || a.id.localeCompare(b.id);
affected.sort(byRepThenDate);
skippedStatus.sort(byRepThenDate);

console.log(`Mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}`);
console.log(`Scanned ${snap.size} sale(s).`);
console.log('');
console.log(`Sales to repair (installDate strictly before saleDate): ${affected.length}`);
for (const row of affected) {
  console.log(
    `  ${row.id}  ${row.repName}  |  ${row.customerName}  |  saleDate ${row.saleDay} -> ${dayKey(row.proposed)}  (install ${row.installDay})`,
  );
}

console.log('');
console.log(`Skipped, cancelled/rejected but otherwise matching: ${skippedStatus.length}`);
for (const row of skippedStatus) {
  console.log(
    `  ${row.id}  ${row.repName}  |  ${row.customerName}  |  saleDate ${row.saleDay}, install ${row.installDay}  [${row.status}]`,
  );
}

console.log('');
console.log('Not affected:');
console.log(`  ${consistent} sale(s) with installDate on or after saleDate (normal)`);
console.log(`  ${noInstallDate} sale(s) with no installDate (undetectable, left alone)`);
console.log(`  ${noSaleDate} sale(s) with no saleDate`);

if (!apply) {
  console.log('');
  console.log(`Dry run — nothing written. Re-run with --apply to repair ${affected.length} sale(s).`);
  process.exit(0);
}

console.log('');
console.log('Applying...');
let written = 0;
for (let i = 0; i < affected.length; i += BATCH_LIMIT) {
  const chunk = affected.slice(i, i + BATCH_LIMIT);
  const batch = db.batch();
  for (const row of chunk) {
    batch.update(row.ref, {
      saleDate: Timestamp.fromDate(row.proposed),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }
  await batch.commit();
  for (const row of chunk) {
    // Audit line: reversible by hand from `before`.
    console.log(`CHANGED sales/${row.id}  saleDate before=${row.saleDay}  after=${dayKey(row.proposed)}`);
    written += 1;
  }
}
console.log(`Updated ${written} sale(s).`);
