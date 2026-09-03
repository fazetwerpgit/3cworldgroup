// Correct a sale that carries two internet plans down to the one actually sold.
//
// Only one internet plan can exist at an address, so a sale carrying two is a
// data error, not a bundle (src/lib/sales/planSelection.ts). The form can no
// longer create one; this repairs the rows made before that rule existed.
//
// Which plan survives is a HUMAN decision — the data cannot say which one the
// customer got — so every repair is named explicitly below. Nothing is inferred
// and nothing is picked by price.
//
//   node scripts/repair-double-plan-sale.mjs           -> DRY RUN (default)
//   node scripts/repair-double-plan-sale.mjs --apply   -> write the repairs
//
// Also reports any OTHER sale carrying two internet plans that is not listed
// here, so a second one cannot go unnoticed.
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
initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))) });
const db = getFirestore();

// Jacob, 2026-09-03: "it looks like will accidentally selected both the 2 gig
// and the 1 gig. i believe he actually got only a 2 gig." Confirmed go-ahead
// the same day.
const REPAIRS = [
  { saleId: '3OWM4xPfzZZqHnJizabE', keepProductId: 'tfiber-2gig', note: '12150 Parkside Cir — Will Teasdale' },
];

// The five Xfinity add-ons. Everything else on a sale is an internet plan,
// including an id retired from the catalog — mirrors isExtraPlanId().
const EXTRA_IDS = new Set([
  'xfinity-eero-secure',
  'xfinity-wireless-byod',
  'xfinity-wireless-standard',
  'xfinity-tv',
  'xfinity-home-phone',
]);
const internetOnly = (products) => products.filter((p) => !EXTRA_IDS.has(p.productId));

const snap = await db.collection('sales').get();
const byId = new Map(snap.docs.map((d) => [d.id, d]));
const targeted = new Set(REPAIRS.map((r) => r.saleId));

const writes = [];
let refused = 0;

for (const repair of REPAIRS) {
  const doc = byId.get(repair.saleId);
  if (!doc) {
    refused += 1;
    console.log(`REFUSED  ${repair.saleId} — no such sale.`);
    continue;
  }
  const sale = doc.data();
  const products = Array.isArray(sale.products) ? sale.products : [];
  const net = internetOnly(products);

  if (net.length <= 1) {
    console.log(`SKIP     ${repair.saleId} — already has ${net.length} internet plan(s). Nothing to repair.`);
    continue;
  }
  const keep = net.find((p) => p.productId === repair.keepProductId);
  if (!keep) {
    refused += 1;
    console.log(
      `REFUSED  ${repair.saleId} — "${repair.keepProductId}" is not on this sale ` +
      `(it has ${net.map((p) => p.productId).join(', ')}).`,
    );
    continue;
  }

  // Drop the other internet plans; every extra stays. Values are recomputed
  // from the surviving lines rather than subtracted, so a sale whose stored
  // total was already wrong comes out right.
  const nextProducts = products.filter((p) => EXTRA_IDS.has(p.productId) || p.productId === repair.keepProductId);
  const totalValue = nextProducts.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
  const totalPoints = nextProducts.reduce((sum, p) => sum + (p.points || 0), 0);
  const dropped = net.filter((p) => p.productId !== repair.keepProductId);

  console.log(
    `REPAIR   ${repair.saleId}  ${repair.note}\n` +
    `         drop  ${dropped.map((p) => `${p.productName} $${p.totalPrice}`).join(', ')}\n` +
    `         keep  ${nextProducts.map((p) => p.productName).join(', ')}\n` +
    `         $${sale.totalValue} -> $${totalValue}   ${sale.totalPoints} pts -> ${totalPoints} pts`,
  );

  writes.push({
    ref: doc.ref,
    data: {
      products: nextProducts,
      totalValue,
      totalPoints,
      // productSold is the display string the list and the carrier match read.
      productSold: nextProducts.map((p) => p.productName).join(', '),
      updatedAt: new Date(),
    },
  });
}

// Anything else in the book with the same problem, so it cannot hide.
const others = snap.docs.filter(
  (d) => !targeted.has(d.id) && internetOnly(Array.isArray(d.data().products) ? d.data().products : []).length > 1,
);
if (others.length > 0) {
  console.log(`\nNOT LISTED — ${others.length} other sale(s) also carry two internet plans:`);
  for (const d of others) {
    const s = d.data();
    console.log(`  ${d.id}  ${s.customerAddress}  rep ${s.salesRepName}  $${s.totalValue}  ` +
      `${internetOnly(s.products).map((p) => p.productId).join(' + ')}`);
  }
  console.log('  Ask which plan each customer actually got, then add them above.');
} else {
  console.log('\nNo other sale in the book carries two internet plans.');
}

console.log(`\n${apply ? 'APPLY' : 'DRY RUN'} — ${writes.length} to repair, ${refused} refused.`);

if (!apply) {
  console.log('Nothing was written. Re-run with --apply to write these repairs.');
  process.exit(refused > 0 ? 1 : 0);
}

for (const { ref, data } of writes) {
  await ref.update(data);
  console.log(`written  ${ref.id}`);
}
console.log(`\nDone. ${writes.length} sale(s) repaired.`);
