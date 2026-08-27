// Read-only diagnostic: list recent job applications (name, city, submitted date).
//   node scripts/diagnose-recent-applications.mjs [--days 14]
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const i = process.argv.indexOf('--days');
const days = i >= 0 ? Number(process.argv[i + 1]) : 14;

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

const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
const snap = await db.collection('applications').get();
const rows = [];
for (const doc of snap.docs) {
  const data = doc.data();
  const created = data.createdAt?.toDate?.() ?? data.submittedAt?.toDate?.() ?? null;
  if (created && created < since) continue;
  rows.push({
    name: data.name ?? data.fullName ?? '?',
    city: data.city ?? '?',
    status: data.status ?? '?',
    submitted: created ? created.toLocaleString('en-US', { timeZone: 'America/Chicago' }) : '?',
  });
}
rows.sort((a, b) => (a.submitted < b.submitted ? 1 : -1));
for (const r of rows) console.log(JSON.stringify(r));
console.log(`${rows.length} application(s) in the last ${days} days.`);
