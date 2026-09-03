// Link carrier orders to portal sales the address guess missed on a TYPO.
//
// The live merge check (docs/superpowers/specs/2026-09-03-one-book-live-check.md)
// audited all 213 never_logged rows and found exactly two real misses, both rep
// typos in the address the rep typed into the portal:
//
//   order "58030 JEWELL RD"  vs sale "58030 Jewwel Rd., Washington, MI"
//   order "7204 SW 14TH ST"  vs sale "7204 dw 14th st Des Moines ia"
//
// Writing an explicit saleLink is the fix the merge is built for: it outranks
// the address guess for good, so a later re-import cannot un-join the row.
// This does NOT correct the sale's address text — the rep typed it, and
// rewriting a rep's own entry is a human's call, not a script's.
//
//   node scripts/link-typo-address-orders.mjs           -> DRY RUN (default)
//   node scripts/link-typo-address-orders.mjs --apply   -> write the links
//
// The --apply flag is the only thing that enables writes. Re-running is safe:
// a pair already carrying the intended saleLink is reported and skipped.
import nextEnv from '@next/env'; // CommonJS: no named ESM exports
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const { loadEnvConfig } = nextEnv;
const apply = process.argv.includes('--apply');

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

// Each pair names the two rows by the exact text each side stores. Both sides
// must resolve to exactly ONE document or the pair is refused: a script that
// guesses which of several candidates was meant is how the wrong house gets
// marked paid.
const PAIRS = [
  { orderAddress: '58030 JEWELL RD', saleAddress: '58030 Jewwel Rd., Washington, MI' },
  { orderAddress: '7204 SW 14TH ST', saleAddress: '7204 dw 14th st Des Moines ia' },
];

const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const [orderSnap, saleSnap] = await Promise.all([
  db.collection('fiberOrders').get(),
  db.collection('sales').get(),
]);

const findOne = (snap, field, wanted) =>
  snap.docs.filter((d) => norm(d.data()[field]) === norm(wanted));

let planned = 0;
let refused = 0;
let alreadyLinked = 0;
const writes = [];

for (const pair of PAIRS) {
  const orders = findOne(orderSnap, 'address', pair.orderAddress);
  const sales = findOne(saleSnap, 'customerAddress', pair.saleAddress);

  if (orders.length !== 1 || sales.length !== 1) {
    refused += 1;
    console.log(
      `REFUSED  ${pair.orderAddress}\n` +
      `         orders matched: ${orders.length}, sales matched: ${sales.length} — need exactly 1 of each.`,
    );
    continue;
  }

  const order = orders[0];
  const sale = sales[0];
  const existing = order.data().saleLink;
  if (existing && existing.saleId === sale.id) {
    alreadyLinked += 1;
    console.log(`SKIP     ${pair.orderAddress} — already linked to ${sale.id}`);
    continue;
  }
  if (existing) {
    refused += 1;
    console.log(
      `REFUSED  ${pair.orderAddress} — already carries a different saleLink ` +
      `(saleId ${JSON.stringify(existing.saleId)}). Clear it in the board first.`,
    );
    continue;
  }

  planned += 1;
  const saleData = sale.data();
  console.log(
    `LINK     order ${order.id}  "${order.data().address}"\n` +
    `      -> sale  ${sale.id}  "${saleData.customerAddress}"  ` +
    `$${Number(saleData.totalValue ?? 0).toFixed(2)}  rep ${saleData.salesRepName ?? '?'}`,
  );
  writes.push({ order, saleId: sale.id });
}

console.log(
  `\n${apply ? 'APPLY' : 'DRY RUN'} — ${planned} to link, ` +
  `${alreadyLinked} already linked, ${refused} refused.`,
);

if (!apply) {
  console.log('Nothing was written. Re-run with --apply to write these links.');
  process.exit(refused > 0 ? 1 : 0);
}

const at = new Date().toISOString();
for (const { order, saleId } of writes) {
  // Same shape the /api/portal/sales/status/link route writes, so the board's
  // "linked manually" badge and its undo both behave identically.
  await order.ref.update({
    saleLink: { saleId, by: 'script:link-typo-address-orders', byName: 'Address typo repair', at },
    updatedAt: at,
  });
  console.log(`written  ${order.id} -> ${saleId}`);
}
console.log(`\nDone. ${writes.length} link(s) written.`);
console.log('The board reads fiberOrders through a cache keyed on lastReportAt —');
console.log('open it with ?fresh=1 once to see these immediately.');
