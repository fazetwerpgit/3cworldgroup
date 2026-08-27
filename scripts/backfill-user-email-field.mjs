// Backfill: copy legacy 'Email' (capital E) into the canonical 'email' field on
// user docs that lack it, so every email fan-out sees the address.
//   node scripts/backfill-user-email-field.mjs           -> dry run (report only)
//   node scripts/backfill-user-email-field.mjs --apply   -> write changes
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const apply = process.argv.includes('--apply');

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// Same preference and fallback as src/lib/firebase/admin.ts (see diagnose-streak.mjs).
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
    credential = cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')));
  } catch {
    // fall through to individual vars
  }
}
if (!credential) {
  let pk = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!pk.includes('-----BEGIN')) pk = Buffer.from(pk, 'base64').toString('utf-8');
  credential = cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: pk.replace(/\\n/g, '\n'),
  });
}
initializeApp({ credential });
const db = getFirestore();

const snap = await db.collection('users').get();
let fixed = 0;
for (const doc of snap.docs) {
  const data = doc.data();
  const legacy = typeof data.Email === 'string' ? data.Email.trim() : '';
  const canonical = typeof data.email === 'string' ? data.email.trim() : '';
  if (canonical || !legacy || !legacy.includes('@')) continue;
  fixed += 1;
  console.log(`${apply ? 'FIX' : 'WOULD FIX'} users/${doc.id} (${data.displayName ?? '?'}) email <- ${legacy}`);
  if (apply) await doc.ref.update({ email: legacy });
}
console.log(`${apply ? 'Updated' : 'Would update'} ${fixed} doc(s).`);
