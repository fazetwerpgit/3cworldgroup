// Removes everything the QA E2E bots created, so review pages stay clean.
//   node scripts/e2e-cleanup.mjs                 -> delete every bot's form submissions + their notifications
//   node scripts/e2e-cleanup.mjs --delete-user   -> also delete the QA auth users + profiles
//
// Matches submissions by repUid across the whole bot pool. Safe to re-run.
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

const BOT_COUNT = Number(process.env.E2E_BOT_COUNT || 3);
const auth = getAuth();
const db = getFirestore();

// Resolve every bot uid that exists.
const uids = [];
for (let i = 1; i <= BOT_COUNT; i++) {
  const email = `qa-e2e-${i}@3cworldgroup.test`;
  const user = await auth.getUserByEmail(email).catch(() => null);
  if (user) uids.push({ email, uid: user.uid });
}
if (uids.length === 0) {
  console.log('No QA bots found — nothing to clean.');
  process.exit(0);
}

const FORM_COLLECTIONS = [
  'fiberReports',
  'expediteOrders',
  'payrollDisputes',
  'leadsRequests',
  'managerInterviews',
  'bugReports',
];

let removed = 0;
for (const { uid } of uids) {
  for (const col of FORM_COLLECTIONS) {
    const snap = await db.collection(col).where('repUid', '==', uid).get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
      removed++;
    }
    if (snap.size) console.log(`  ${col} (${uid.slice(0, 6)}…): deleted ${snap.size}`);
  }
  // Clear the bot's own notification bell (safe; leaves real admins' bells alone).
  const notifSnap = await db.collection('notifications').where('userId', '==', uid).get();
  for (const doc of notifSnap.docs) {
    await doc.ref.delete();
    removed++;
  }
}

console.log(`\nCleanup complete — removed ${removed} documents created by ${uids.length} QA bots.`);

if (process.argv.includes('--delete-user')) {
  for (const { uid, email } of uids) {
    await db.collection('users').doc(uid).delete().catch(() => {});
    await auth.deleteUser(uid).catch(() => {});
    console.log(`Deleted QA bot ${email}.`);
  }
}
