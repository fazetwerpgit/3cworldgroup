// Creates (or resets) a dedicated QA test user for end-to-end tests.
// Uses the local Firebase Admin key from .env.local. Safe to re-run.
//
//   node scripts/e2e-create-test-user.mjs
//
// Prints the email + password to use as E2E_EMAIL / E2E_PASSWORD.
// The account is role: 'admin' so it can reach every form (incl. manager-interview)
// and its own submissions in the review pages. Delete it later with
// scripts/e2e-cleanup.mjs --delete-user.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
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

const EMAIL = process.env.E2E_EMAIL || 'qa-e2e@3cworldgroup.test';
const PASSWORD = process.env.E2E_PASSWORD || 'QaE2e!TestPass2026';
const DISPLAY = 'QA E2E Bot';

const auth = getAuth();
const db = getFirestore();

let uid;
try {
  const existing = await auth.getUserByEmail(EMAIL);
  uid = existing.uid;
  await auth.updateUser(uid, { password: PASSWORD, displayName: DISPLAY });
  console.log(`Reset existing test user: ${EMAIL}`);
} catch {
  const created = await auth.createUser({ email: EMAIL, password: PASSWORD, displayName: DISPLAY });
  uid = created.uid;
  console.log(`Created test user: ${EMAIL}`);
}

await db.collection('users').doc(uid).set(
  {
    email: EMAIL,
    displayName: DISPLAY,
    role: 'admin',
    managerId: null,
    territoryId: null,
    phone: '',
    status: 'active',
    isE2ETestUser: true, // marker so cleanup can find it
    hireDate: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  { merge: true }
);

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

console.log('\nUse these in your test env:');
console.log(`  E2E_EMAIL=${EMAIL}`);
console.log(`  E2E_PASSWORD=${PASSWORD}`);
console.log(`  uid=${uid}`);
