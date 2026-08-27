// Read-only diagnostic: who receives form-submission alert emails today?
//   node scripts/diagnose-form-alert-recipients.mjs
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envFile = '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
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

const MGMT = ['admin', 'operations', 'owner'];
const snap = await db.collection('users').get();
for (const d of snap.docs) {
  const data = d.data();
  if (!MGMT.includes(data.role)) continue;
  console.log(
    JSON.stringify({
      uid: d.id,
      role: data.role,
      displayName: data.displayName ?? null,
      email_lower: data.email ?? null,
      Email_upper: data.Email ?? null,
    })
  );
}
const alertDoc = await db.collection('formAlerts').doc('application').get();
console.log('formAlerts/application:', alertDoc.exists ? JSON.stringify(alertDoc.data()) : '(missing => default ON)');
