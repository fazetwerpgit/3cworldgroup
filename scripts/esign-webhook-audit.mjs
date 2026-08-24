// Audits e-sign state: compares every userOnboarding item that has a SignWell
// envelope against SignWell's actual document status, and lists the webhooks
// SignWell has registered (to explain missed document_completed events).
// --apply backfills items SignWell says are Completed but the portal still
// shows submitted — writing exactly what the webhook handler would have
// (status approved, reviewer "E-sign (auto)") plus the "Document signed"
// bell notification. Activation-readiness flagging is NOT replicated; check
// affected reps in /portal/admin/onboarding afterwards.
//   node scripts/esign-webhook-audit.mjs [--env <envfile>] [--apply]
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');

const envFile = argValue('--env') ?? '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// Same preference and fallback as src/lib/firebase/admin.ts; `vercel env pull`
// escapes the newlines inside the base64 as literal \n — strip those first.
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
    privateKey: pk.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n'),
  });
}
initializeApp({ credential });
const db = getFirestore();
const apiKey = process.env.SIGNWELL_API_KEY;

// 1. What webhooks does SignWell think it should call?
const hooksRes = await fetch('https://www.signwell.com/api/v1/hooks', {
  headers: { 'X-Api-Key': apiKey },
});
if (hooksRes.ok) {
  const hooks = await hooksRes.json();
  const list = Array.isArray(hooks) ? hooks : (hooks.hooks ?? hooks.data ?? []);
  console.log(`SignWell registered webhooks: ${list.length}`);
  for (const h of list) console.log(`  id=${h.id}  url=${h.callback_url ?? h.url}`);
} else {
  console.log(`SignWell hooks listing failed: ${hooksRes.status} ${await hooksRes.text()}`);
}
console.log(`Expected webhook URL: ${(process.env.APP_BASE_URL ?? 'https://www.3cworldgroup.com')}/api/webhooks/esign`);
console.log(`SIGNWELL_WEBHOOK_ID env set: ${process.env.SIGNWELL_WEBHOOK_ID ? 'yes' : 'NO'}`);

// 2. Every onboarding item with an envelope, vs SignWell's actual status.
const snap = await db.collection('userOnboarding').get();
const withEnvelope = snap.docs.filter((d) => d.get('esignEnvelopeId'));
console.log(`\nOnboarding items with envelopes: ${withEnvelope.length}`);

const names = new Map();
const repName = async (uid) => {
  if (!names.has(uid)) {
    const u = await db.doc(`users/${uid}`).get();
    names.set(uid, u.get('displayName') ?? uid);
  }
  return names.get(uid);
};

const stuck = [];
for (const doc of withEnvelope) {
  const userId = doc.get('userId');
  const itemId = doc.get('itemId');
  const status = doc.get('status');
  const envelopeId = doc.get('esignEnvelopeId');
  const res = await fetch(`https://www.signwell.com/api/v1/documents/${envelopeId}`, {
    headers: { 'X-Api-Key': apiKey },
  });
  const swStatus = res.ok ? (await res.json()).status : `HTTP ${res.status}`;
  const name = await repName(userId);
  const completedButStuck = String(swStatus).toLowerCase() === 'completed' && status !== 'approved';
  console.log(`  ${completedButStuck ? '!!' : 'ok'} ${name}  ${itemId}  portal=${status}  reviewer=${doc.get('reviewerName') ?? '-'}  signwell=${swStatus}`);
  if (completedButStuck) stuck.push({ ref: doc.ref, userId, itemId, name });
}

console.log(`\nSigned at SignWell but not approved in portal: ${stuck.length}`);
if (!apply || stuck.length === 0) {
  if (stuck.length > 0) console.log('Dry run — re-run with --apply to backfill these as the webhook would have.');
  process.exit(0);
}

const ITEM_LABELS = {
  contract: 'Contract',
  direct_deposit: 'Direct Deposit',
  pay_structure: 'Compensation',
  fcra_auth: 'Background Check Authorization (FCRA)',
};
for (const s of stuck) {
  const now = new Date();
  // Mirror of the document_completed write in src/app/api/webhooks/esign/route.ts.
  await s.ref.set(
    {
      userId: s.userId,
      itemId: s.itemId,
      status: 'approved',
      rejectionReason: null,
      reviewedBy: 'system',
      reviewerName: 'E-sign (auto)',
      reviewedAt: now,
      updatedAt: now,
    },
    { merge: true }
  );
  await db.collection('notifications').add({
    userId: s.userId,
    type: 'esign_completed',
    title: 'Document signed',
    message: `${ITEM_LABELS[s.itemId] ?? s.itemId} is complete.`,
    link: '/portal/onboarding',
    read: false,
    createdAt: now,
  });
  console.log(`  backfilled ${s.name} ${s.itemId} -> approved`);
}
console.log('Done. Review affected reps in /portal/admin/onboarding (activation flags were not auto-set).');
