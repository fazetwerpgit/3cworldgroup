// Backfill: invites stuck at 'submitted' (or 'in_progress') for a hire who is
// already active. Before activation closed out the invite, a hire who went
// active through Review / Mark complete / e-sign kept a 'Submitted' invite with
// Activate/Reject buttons. Marks those invites (and their linked applications)
// 'converted', as activation now does.
//   node scripts/backfill-converted-invites.mjs           -> dry run (report only)
//   node scripts/backfill-converted-invites.mjs --apply   -> write changes
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

const snap = await db.collection('onboardingInvites').where('status', 'in', ['submitted', 'in_progress']).get();
let invites = 0;
let applications = 0;
const now = new Date();
for (const doc of snap.docs) {
  const data = doc.data();
  if (!data.convertedUserId) continue;
  const user = await db.collection('users').doc(data.convertedUserId).get();
  if (!user.exists || user.get('status') !== 'active') continue;

  invites += 1;
  console.log(
    `${apply ? 'FIX' : 'WOULD FIX'} onboardingInvites/${doc.id} (${data.candidateName ?? '?'}) ${data.status} -> converted (user ${data.convertedUserId} is active)`
  );
  if (apply) {
    await doc.ref.set({ status: 'converted', convertedUserId: data.convertedUserId, updatedAt: now }, { merge: true });
  }

  if (data.applicationId) {
    const app = await db.collection('applications').doc(data.applicationId).get();
    if (app.exists && app.get('status') !== 'converted') {
      applications += 1;
      console.log(`  ${apply ? 'FIX' : 'WOULD FIX'} applications/${data.applicationId} ${app.get('status')} -> converted`);
      if (apply) {
        await app.ref.set({ status: 'converted', convertedUserId: data.convertedUserId, updatedAt: now }, { merge: true });
      }
    }
  }
}
console.log(`${apply ? 'Updated' : 'Would update'} ${invites} invite(s) and ${applications} application(s).`);
