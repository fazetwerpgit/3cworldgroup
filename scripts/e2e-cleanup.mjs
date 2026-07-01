// Removes everything the QA E2E bot created, so review pages stay clean.
//   node scripts/e2e-cleanup.mjs                 -> delete the bot's form submissions + its notifications
//   node scripts/e2e-cleanup.mjs --delete-user   -> also delete the QA auth user + profile
//
// Matches submissions by repUid === the QA user's uid. Safe to re-run.
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
const auth = getAuth();
const db = getFirestore();

const user = await auth.getUserByEmail(EMAIL).catch(() => null);
if (!user) {
  console.log(`No test user ${EMAIL} found — nothing to clean.`);
  process.exit(0);
}
const uid = user.uid;

// Every collection a form submission can land in.
const FORM_COLLECTIONS = [
  'fiberReports',
  'expediteOrders',
  'payrollDisputes',
  'leadsRequests',
  'managerInterviews',
  'bugReports',
];

let removed = 0;
for (const col of FORM_COLLECTIONS) {
  const snap = await db.collection(col).where('repUid', '==', uid).get();
  for (const doc of snap.docs) {
    await doc.ref.delete();
    removed++;
  }
  if (snap.size) console.log(`  ${col}: deleted ${snap.size}`);
}

// Notifications the bot's submissions produced (targeted at admins). Delete any
// notification metadata.formKey exists AND was created for the bot's own actions
// is hard to attribute precisely, so we only clear notifications addressed TO the
// bot user (safe, its own bell), leaving real admins' bells untouched.
const notifSnap = await db.collection('notifications').where('userId', '==', uid).get();
for (const doc of notifSnap.docs) {
  await doc.ref.delete();
  removed++;
}
if (notifSnap.size) console.log(`  notifications (bot's own): deleted ${notifSnap.size}`);

console.log(`\nCleanup complete — removed ${removed} documents created by the QA bot.`);

if (process.argv.includes('--delete-user')) {
  await db.collection('users').doc(uid).delete().catch(() => {});
  await auth.deleteUser(uid).catch(() => {});
  console.log(`Deleted QA test user ${EMAIL}.`);
}
