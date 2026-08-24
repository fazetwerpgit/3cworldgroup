// One-off ops tool: refresh a rep's stale SignWell embedded signing link and
// nudge them (in-app bell + email) to try "Sign now" again — no manual contact
// needed. The envelope is NOT re-created; we fetch a currently-valid
// embedded_signing_url for the existing document and overwrite the stored one.
//   node scripts/refresh-esign-link.mjs --name "Mason Steinberger" --item pay_structure           # dry run
//   node scripts/refresh-esign-link.mjs --name "Mason Steinberger" --item pay_structure --apply   # write + notify
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const apply = process.argv.includes('--apply');
const name = argValue('--name');
const itemId = argValue('--item');
const ITEM_LABELS = {
  contract: 'Contract',
  direct_deposit: 'Direct Deposit',
  pay_structure: 'Compensation',
  fcra_auth: 'Background Check Authorization (FCRA)',
  w9: 'W-9',
};
if (!name || !ITEM_LABELS[itemId]) {
  console.error('Usage: node scripts/refresh-esign-link.mjs --name "Full Name" --item <contract|direct_deposit|pay_structure|fcra_auth|w9> [--apply]');
  process.exit(1);
}

const envFile = argValue('--env') ?? '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
// Same preference and fallback as src/lib/firebase/admin.ts. The stored
// FIREBASE_SERVICE_ACCOUNT base64 contains real newlines (harmless to prod's
// decoder); `vercel env pull` escapes them as literal \n, so strip those
// two-char sequences FIRST, then anything else outside the base64 alphabet.
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

// 1. Find the rep by display name (exact, then case-insensitive scan).
let userSnap = await db.collection('users').where('displayName', '==', name).get();
if (userSnap.empty) {
  const all = await db.collection('users').get();
  const matches = all.docs.filter(
    (d) => (d.get('displayName') ?? '').toLowerCase() === name.toLowerCase()
  );
  if (matches.length !== 1) {
    console.error(`Found ${matches.length} users matching "${name}" — aborting.`);
    process.exit(1);
  }
  userSnap = { docs: matches };
}
if (userSnap.docs.length !== 1) {
  console.error(`Found ${userSnap.docs.length} users named "${name}" — aborting.`);
  process.exit(1);
}
const user = userSnap.docs[0];
const uid = user.id;
const email = user.get('email') ?? user.get('Email');
console.log(`User: ${user.get('displayName')} (${uid}), email: ${email}, status: ${user.get('status')}`);

// 2. Locate the envelope for the item.
const progress = await db.doc(`userOnboarding/${uid}_${itemId}`).get();
const envelopeId = progress.get('esignEnvelopeId');
const status = progress.get('status');
console.log(`Item ${itemId}: status=${status}, envelopeId=${envelopeId ?? 'MISSING'}`);
if (!envelopeId) {
  console.error('No envelope on file — nothing to refresh (auto-send will create one on next portal open).');
  process.exit(1);
}
if (status === 'approved') {
  console.error('Item already approved — nothing to do.');
  process.exit(1);
}

// 3. Fetch a currently-valid embedded signing URL for the existing document.
const res = await fetch(`https://www.signwell.com/api/v1/documents/${envelopeId}`, {
  headers: { 'X-Api-Key': process.env.SIGNWELL_API_KEY },
});
if (!res.ok) {
  console.error(`SignWell GET document failed: ${res.status} ${await res.text()}`);
  process.exit(1);
}
const doc = await res.json();
const signer = doc.recipients?.find((r) => r.id === 'signer') ?? doc.recipients?.[0];
const url = signer?.embedded_signing_url;
console.log(`SignWell document status: ${doc.status}, fresh embedded_signing_url: ${url ? 'YES' : 'NO'}`);
if (!url) {
  console.error('SignWell returned no embedded signing URL — document may be completed or voided.');
  process.exit(1);
}

if (!apply) {
  console.log('\nDry run — nothing written. Re-run with --apply to persist the URL and notify the rep.');
  process.exit(0);
}

// --email-only: retry just the email leg (e.g. after a From-address failure)
// without re-writing the URL or duplicating the bell notification.
const emailOnly = process.argv.includes('--email-only');
const label = ITEM_LABELS[itemId];
const title = 'Your document is ready to sign';
const message = `Your ${label} document is ready — open Onboarding and tap Sign now.`;

if (!emailOnly) {
  // 4. Persist (same shape as src/lib/esign/autoSend.ts persistSigningUrl).
  await db.doc(`esignSigningUrls/${uid}_${itemId}`).set(
    { userId: uid, itemId, envelopeId, url, updatedAt: new Date() },
    { merge: true }
  );
  console.log('Stored fresh signing URL.');

  // 5. Nudge: in-app bell (same shape as createNotification) + email via Postmark.
  await db.collection('notifications').add({
    userId: uid,
    type: 'system',
    title,
    message,
    link: '/portal/onboarding',
    read: false,
    createdAt: new Date(),
  });
  console.log('In-app notification created.');
}

// Vercel marks some env vars Sensitive; `vercel env pull` writes those as a
// literal "[SENSITIVE]" placeholder — only trust a From that looks like email.
const from = [process.env.ONBOARDING_EMAIL_FROM, process.env.EMAIL_FROM].find(
  (v) => v && v.includes('@')
);
if (email && from && process.env.POSTMARK_SERVER_TOKEN) {
  const mail = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: from,
      To: email,
      Subject: title,
      TextBody: `Hi ${user.get('displayName')},\n\n${message}\n\nSign in at ${process.env.NEXT_PUBLIC_APP_URL || 'https://www.3cworldgroup.com'}/portal/onboarding\n\n- 3C World Group`,
      MessageStream: 'outbound',
    }),
  });
  console.log(mail.ok ? `Email sent to ${email}.` : `Email failed: ${mail.status} ${await mail.text()}`);
} else {
  console.log('Email skipped (missing recipient email, From address, or Postmark token).');
}
