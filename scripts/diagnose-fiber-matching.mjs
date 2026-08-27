// Read-only diagnostic: fiber-order rep matching overview.
//   node scripts/diagnose-fiber-matching.mjs [--name braeden]
// Prints per-repName tallies (matched/unmatched) and, with --name, every order
// whose repName contains the given substring.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const i = process.argv.indexOf('--name');
const needle = i >= 0 ? String(process.argv[i + 1] ?? '').toLowerCase() : '';

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

const snap = await db.collection('fiberOrders').get();
const tally = new Map();
for (const doc of snap.docs) {
  const data = doc.data();
  const key = `${data.repName ?? '?'} | dealer:${data.repDealerId ?? ''}`;
  const entry = tally.get(key) ?? { matched: 0, unmatched: 0, matchedUserId: null };
  if (data.matchedUserId) {
    entry.matched += 1;
    entry.matchedUserId = data.matchedUserId;
  } else {
    entry.unmatched += 1;
  }
  tally.set(key, entry);
  if (needle && String(data.repName ?? '').toLowerCase().includes(needle)) {
    console.log('ORDER', JSON.stringify({
      id: doc.id,
      repName: data.repName,
      repDealerId: data.repDealerId ?? '',
      matchedUserId: data.matchedUserId ?? null,
      orderDate: data.orderDate ?? null,
      status: data.status ?? null,
    }));
  }
}
for (const [key, entry] of [...tally.entries()].sort()) {
  console.log(JSON.stringify({ rep: key, ...entry }));
}
console.log(`${snap.docs.length} fiber orders total.`);
