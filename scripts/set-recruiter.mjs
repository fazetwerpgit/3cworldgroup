// Grant or remove the hidden recruiter permission: users/{uid}.recruiter.
// `recruiter: true` opens everything recruiting (Hiring hub: To do, Recruits,
// Pipeline, and their APIs) on top of the user's own role, which stays what it
// is everywhere it is shown. Nothing in the portal displays the flag or
// announces it, and no client can write it (firestore.rules), so this script
// (the Admin SDK) is the only way to set it. See isRecruiter in src/types/auth.ts.
//
//   node scripts/set-recruiter.mjs <uid>                -> DRY RUN (default): reads only
//   node scripts/set-recruiter.mjs <uid> --apply        -> set recruiter: true
//   node scripts/set-recruiter.mjs <uid> --off          -> DRY RUN of removing it
//   node scripts/set-recruiter.mjs <uid> --off --apply  -> delete the field
//
// Writes only the one field: no updatedAt, no audit row, no notification.
// Run from the repo root.
import { createRequire } from 'node:module';

const cwd = process.cwd();
const require = createRequire(cwd + '/');
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const off = args.includes('--off');
const uid = args.find((arg) => !arg.startsWith('--'));

if (!uid) {
  console.error('Usage: node scripts/set-recruiter.mjs <uid> [--off] [--apply]');
  process.exit(1);
}

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(cwd);

// House pattern: FIREBASE_SERVICE_ACCOUNT only (base64 JSON).
// FIREBASE_ADMIN_PRIVATE_KEY is truncated in every environment here.
if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set; cannot authenticate.');
  process.exit(1);
}
let serviceAccount;
try {
  serviceAccount = JSON.parse(
    Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\s+/g, ''), 'base64').toString()
  );
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT is not base64 JSON.');
  process.exit(1);
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const app = initializeApp({ credential: cert(serviceAccount) }, 'set-recruiter');
const db = getFirestore(app);

const ref = db.collection('users').doc(uid);
const snap = await ref.get();
if (!snap.exists) {
  console.error(`No users doc for ${uid}.`);
  process.exit(1);
}
const data = snap.data() ?? {};
const who = data.displayName || data.email || data.Email || uid;
const roleLabel = data.role || data.fieldRole || '(no role)';
const current = data.recruiter === true;
const wanted = !off;

console.log(`User: ${who} (${uid}), role ${roleLabel}, status ${data.status ?? '(none)'}`);
console.log(`recruiter now: ${current ? 'true' : 'not set'}; wanted: ${wanted ? 'true' : 'not set'}`);

if (current === wanted && (wanted || !('recruiter' in data))) {
  console.log('Nothing to change.');
  process.exit(0);
}

if (!apply) {
  console.log(`DRY RUN: would ${wanted ? 'set recruiter: true' : 'delete the recruiter field'}. Re-run with --apply to write.`);
  process.exit(0);
}

await ref.update({ recruiter: wanted ? true : FieldValue.delete() });
const after = (await ref.get()).data() ?? {};
console.log(`Done. recruiter is now ${after.recruiter === true ? 'true' : 'not set'}.`);
process.exit(0);
