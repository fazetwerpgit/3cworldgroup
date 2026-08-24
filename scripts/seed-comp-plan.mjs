// Seeds config/compPlan (per-install rates) and config/compPlanMargin
// ("3C Receives", owner-only) from src/data/compPlan.generated.json — the same
// file the app imports, so seed and app can never disagree.
// Idempotent: re-running overwrites both docs with the committed plan.
//   node scripts/seed-comp-plan.mjs            # dry run (default)
//   node scripts/seed-comp-plan.mjs --apply    # write
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');

const plan = JSON.parse(readFileSync('src/data/compPlan.generated.json', 'utf-8'));
const roles = Object.keys(plan.rates);
const rateCount = roles.reduce(
  (total, role) =>
    total + Object.values(plan.rates[role]).reduce((n, plans) => n + Object.keys(plans).length, 0),
  0
);
const marginCount = Object.values(plan.margin).reduce((n, plans) => n + Object.keys(plans).length, 0);

console.log(`Comp plan version ${plan.version}`);
console.log(`  config/compPlan:       ${roles.length} roles, ${rateCount} rates`);
console.log(`  config/compPlanMargin: ${marginCount} margin entries (owner-only)`);

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to seed Firestore.');
  process.exit(0);
}

const envFile = process.env.ENV_FILE || '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  // Whole service-account JSON, base64 (possibly with stray literal \n runs).
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n\s*/g, '');
  initializeApp({ credential: cert(JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))) });
} else {
  let pk = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!pk.includes('-----BEGIN')) pk = Buffer.from(pk, 'base64').toString('utf-8');
  pk = pk.replace(/\\n/g, '\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: pk,
    }),
  });
}
const db = getFirestore();

await db.collection('config').doc('compPlan').set({
  rates: plan.rates,
  version: plan.version,
  updatedAt: FieldValue.serverTimestamp(),
  updatedBy: 'seed-comp-plan',
  updatedByName: 'Comp plan seed',
});
console.log('  wrote config/compPlan');

await db.collection('config').doc('compPlanMargin').set({
  margin: plan.margin,
  version: plan.version,
  updatedAt: FieldValue.serverTimestamp(),
});
console.log('  wrote config/compPlanMargin');

console.log('\nComp plan seeded.');
