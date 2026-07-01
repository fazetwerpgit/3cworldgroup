// Creates (or resets) the POOL of QA test users for end-to-end tests.
// Uses the local Firebase Admin key from .env.local. Safe to re-run.
//
//   node scripts/e2e-create-test-user.mjs            -> 3 bots (default)
//   E2E_BOT_COUNT=5 node scripts/e2e-create-test-user.mjs
//
// Each bot is a field manager (fieldRole: 'l1_manager') — the LEAST privilege that
// can still reach every form, including manager-interview (which allows l1/l2
// managers). Deliberately NOT admin: a leaked test login should not be powerful.
// Delete them later with scripts/e2e-cleanup.mjs --delete-user.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!privateKey.includes('-----BEGIN')) {
  privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
}
privateKey = privateKey.replace(/\\n/g, '\n');

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});

const BOT_COUNT = Number(process.env.E2E_BOT_COUNT || 3);
const BOT_SECRET = process.env.E2E_BOT_SECRET;
if (!BOT_SECRET) {
  console.error('E2E_BOT_SECRET is not set. Set a strong secret first, e.g.:');
  console.error('  E2E_BOT_SECRET=<your-secret> npm run e2e:setup');
  process.exit(1);
}
const bot = (i) => ({
  email: `qa-e2e-${i}@3cworldgroup.test`,
  password: `${BOT_SECRET}#${i}`,
  displayName: `QA E2E Bot ${i}`,
});

const auth = getAuth();
const db = getFirestore();

for (let i = 1; i <= BOT_COUNT; i++) {
  const { email, password, displayName } = bot(i);
  let uid;
  try {
    const existing = await auth.getUserByEmail(email);
    uid = existing.uid;
    await auth.updateUser(uid, { password, displayName });
    console.log(`Reset bot ${i}: ${email}`);
  } catch {
    const created = await auth.createUser({ email, password, displayName });
    uid = created.uid;
    console.log(`Created bot ${i}: ${email}`);
  }

  await db.collection('users').doc(uid).set(
    {
      email,
      displayName,
      fieldRole: 'l1_manager', // least privilege that reaches every form
      role: FieldValue.delete(), // clear any prior admin role on re-run (platform role would otherwise win)
      managerId: null,
      territoryId: null,
      phone: '',
      status: 'active',
      isE2ETestUser: true, // marker so cleanup can find them
      hireDate: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    { merge: true }
  );
}

// The Manager Interview form requires a configured market (hireMarkets defaults
// empty). Seed one so the E2E test can complete that form. Harmless in prod — it
// just adds "QA Test Market" as a selectable market until an admin edits the list.
const marketDoc = await db.collection('formOptions').doc('hireMarkets').get();
const existingMarkets = marketDoc.exists ? marketDoc.data()?.values ?? [] : [];
if (!existingMarkets.includes('QA Test Market')) {
  await db.collection('formOptions').doc('hireMarkets').set(
    { values: [...existingMarkets, 'QA Test Market'], updatedBy: 'e2e-setup', updatedAt: new Date() },
    { merge: true }
  );
  console.log('Seeded "QA Test Market" into hireMarkets so the interview form can be tested.');
}

console.log(`\n${BOT_COUNT} QA bots ready. Passwords = E2E_BOT_SECRET + "#<n>" (not stored in the repo).`);
