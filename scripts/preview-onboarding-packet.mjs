// One-off: compose and send the owner onboarding-packet email for a rep so it
// can be previewed before more owners are added. Mirrors
// src/lib/onboarding/ownerNotify.ts sendOnboardingPacket (ee8c4af): profile,
// checklist, MASKED-ONLY sensitive fields, signed PDFs attached (8MB cap).
// PDFs are fetched live from SignWell for completed envelopes when no stored
// copy exists yet (the webhook that stores them has not fired historically).
// Recipients: the real owner list (users with role=owner) unless --send-to
// overrides it.
//   node scripts/preview-onboarding-packet.mjs --name "Mason Steinberger" --env <envfile> [--send-to you@x.com]
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const name = argValue('--name');
if (!name) {
  console.error('Usage: node scripts/preview-onboarding-packet.mjs --name "Full Name" [--env <envfile>] [--send-to email]');
  process.exit(1);
}

const envFile = argValue('--env') ?? '.env.local';
for (const line of readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
let credential;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  try {
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT.replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, '');
    credential = cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf-8')));
  } catch {
    // fall through
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

const ITEM_LABELS = {
  w9: 'W-9',
  fcra_auth: 'Background Check Authorization (FCRA)',
  background_check: 'Background / Drug Screen Authorization',
  dl_photos: "Driver's License Photos (Front & Back)",
  contract: 'Contract',
  direct_deposit: 'Direct Deposit',
  pay_structure: 'Compensation',
  onboarding_submission: 'Onboarding Submission',
  llc_sos: 'LLC / Secretary of State',
  insurance: 'Proof of Insurance',
  chargeback_card: 'Chargeback Credit Card',
};
const ESIGN_ITEMS = ['contract', 'direct_deposit', 'pay_structure', 'fcra_auth'];
const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
const asDate = (v) => (v?.toDate ? v.toDate() : v ? new Date(v) : null);
const dateText = (v) => {
  const d = asDate(v);
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : '—';
};

// Find the rep.
const users = await db.collection('users').get();
const matches = users.docs.filter((d) => (d.get('displayName') ?? '').toLowerCase() === name.toLowerCase());
if (matches.length !== 1) {
  console.error(`Found ${matches.length} users matching "${name}" — aborting.`);
  process.exit(1);
}
const userDoc = matches[0];
const uid = userDoc.id;
const user = userDoc.data();

const progressSnap = await db.collection('userOnboarding').where('userId', '==', uid).get();
const progressByItem = new Map();
progressSnap.docs.forEach((d) => {
  const data = d.data();
  if (data.itemId) progressByItem.set(data.itemId, data);
});

const profileLines = ['Rep profile:'];
if (user.displayName) profileLines.push(`Display name: ${user.displayName}`);
if (user.email) profileLines.push(`Email: ${user.email}`);
if (user.phone) profileLines.push(`Phone: ${user.phone}`);
if (user.fieldRole) profileLines.push(`Field role: ${user.fieldRole}`);
if (typeof user.isIBO === 'boolean') profileLines.push(`IBO: ${user.isIBO}`);
if (user.createdAt) profileLines.push(`Created at: ${dateText(user.createdAt)}`);

const sensitive = (await db.doc(`userSensitive/${uid}`).get()).data() ?? {};
const sensitiveLines = ['Sensitive fields (masked):'];
if (sensitive.ssnLast4) sensitiveLines.push(`SSN: ***-**-${String(sensitive.ssnLast4).slice(-4)}`);
if (sensitive.dlLast4) sensitiveLines.push(`DL: ********${String(sensitive.dlLast4).slice(-4)}`);
sensitiveLines.push('Full values: portal → Admin → Users → reveal (audited).');

const checklistLines = ['Onboarding checklist:'];
for (const [itemId, p] of [...progressByItem.entries()].sort()) {
  checklistLines.push(
    `${ITEM_LABELS[itemId] ?? itemId}: ${p.status ?? 'not_started'}; submittedAt: ${dateText(p.submittedAt)}; reviewedAt: ${dateText(p.reviewedAt)}`
  );
}

// Attachments: fetch completed PDFs live from SignWell (no stored copies yet).
const attachments = [];
const skipped = [];
let attachmentBytes = 0;
for (const itemId of ESIGN_ITEMS) {
  const p = progressByItem.get(itemId);
  const envelopeId = p?.esignEnvelopeId;
  if (!envelopeId) continue;
  const res = await fetch(`https://www.signwell.com/api/v1/documents/${envelopeId}/completed_pdf`, {
    headers: { 'X-Api-Key': process.env.SIGNWELL_API_KEY },
  });
  if (!res.ok) {
    skipped.push(`${itemId}.pdf (SignWell ${res.status} — likely not completed yet)`);
    continue;
  }
  let buffer;
  const contentType = res.headers.get('content-type')?.toLowerCase() ?? '';
  if (contentType.includes('application/json')) {
    const data = await res.json();
    if (!data.file_url) {
      skipped.push(`${itemId}.pdf (no file_url)`);
      continue;
    }
    const fileRes = await fetch(data.file_url);
    if (!fileRes.ok) {
      skipped.push(`${itemId}.pdf (download ${fileRes.status})`);
      continue;
    }
    buffer = Buffer.from(await fileRes.arrayBuffer());
  } else {
    buffer = Buffer.from(await res.arrayBuffer());
  }
  if (attachmentBytes + buffer.length > MAX_ATTACHMENT_BYTES) {
    skipped.push(`${itemId}.pdf (size cap)`);
    continue;
  }
  attachmentBytes += buffer.length;
  attachments.push({ Name: `${itemId}.pdf`, Content: buffer.toString('base64'), ContentType: 'application/pdf' });
}

const appUrl = process.env.APP_BASE_URL || 'https://www.3cworldgroup.com';
const attachmentLines = ['Attachments:'];
if (skipped.length) attachmentLines.push(`Skipped attachments: ${skipped.join(', ')}`);
else attachmentLines.push('Stored signed PDFs are attached. Uploaded photos and W-9 remain available from the admin page.');
attachmentLines.push(`Admin page: ${appUrl}/portal/admin/onboarding`);

const textBody = [...profileLines, '', ...checklistLines, '', ...sensitiveLines, '', ...attachmentLines].join('\n');
const htmlEscape = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const htmlBody = `<pre style="font-family:Arial,Helvetica,sans-serif;white-space:pre-wrap">${htmlEscape(textBody)}</pre>`;

// Recipients: --send-to override, else real owner list.
let recipients = argValue('--send-to') ? [argValue('--send-to')] : [];
if (recipients.length === 0) {
  const owners = await db.collection('users').where('role', '==', 'owner').get();
  recipients = owners.docs.map((d) => d.get('email')).filter((e) => e && e.includes('@'));
}
console.log(`Packet for ${user.displayName} (${uid})`);
console.log(`Attachments: ${attachments.length} (${Math.round(attachmentBytes / 1024)}KB), skipped: ${skipped.length}`);
console.log(`Recipients: ${recipients.join(', ') || 'NONE — no owner-role users with email'}`);
console.log(`\n----- BODY -----\n${textBody}\n----------------\n`);

const from = [process.env.ONBOARDING_EMAIL_FROM, process.env.EMAIL_FROM].find((v) => v && v.includes('@'));
for (const to of recipients) {
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'X-Postmark-Server-Token': process.env.POSTMARK_SERVER_TOKEN,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      From: from,
      To: to,
      Subject: `Onboarding packet: ${user.displayName}`,
      TextBody: `${textBody}\n`,
      HtmlBody: htmlBody,
      MessageStream: 'outbound',
      ...(attachments.length ? { Attachments: attachments } : {}),
    }),
  });
  console.log(res.ok ? `Sent to ${to}.` : `Send to ${to} failed: ${res.status} ${await res.text()}`);
}
