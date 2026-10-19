// Create the Solar chat channel: chatChannels/solar, audience 'solar' (users
// with a solarRole, plus admin/operations/owner; see canAccessChatChannel in
// src/types/chat.ts). Idempotent: when the doc already exists it is left as is
// (sync-chat-channels.mjs keeps its memberIds fresh), so re-running is safe.
//
//   node scripts/create-solar-chat-channel.mjs           -> DRY RUN (default): reads only
//   node scripts/create-solar-chat-channel.mjs --apply   -> create the channel doc
//
// Prints the member COUNT, never names or uids. Run from the repo root.
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cwd = process.cwd();
const require = createRequire(cwd + '/');
const apply = process.argv.includes('--apply');

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(cwd);

// House pattern: FIREBASE_SERVICE_ACCOUNT only (base64 or raw JSON).
// FIREBASE_ADMIN_PRIVATE_KEY is truncated in every environment here.
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set; cannot authenticate.');
  process.exit(1);
}
let serviceAccount;
try {
  const trimmed = raw.trim();
  serviceAccount = trimmed.startsWith('{')
    ? JSON.parse(trimmed)
    : JSON.parse(Buffer.from(trimmed.replace(/\\n/g, '').replace(/[^A-Za-z0-9+/=]/g, ''), 'base64').toString('utf-8'));
} catch {
  console.error('FIREBASE_SERVICE_ACCOUNT is neither base64 JSON nor JSON.');
  process.exit(1);
}
// src/lib/firebase/admin.ts reads it as base64: hand it that form, so the
// server module initializes the same admin app the route uses.
process.env.FIREBASE_SERVICE_ACCOUNT = Buffer.from(JSON.stringify(serviceAccount)).toString('base64');

// Load the TypeScript server module itself (jiti resolves the @/ alias).
const { createJiti } = require('jiti');
const jiti = createJiti(pathToFileURL(path.join(cwd, 'scripts', 'create-solar-chat-channel.mjs')).href, {
  alias: { '@': path.join(cwd, 'src') },
});
const { adminDb } = await jiti.import(path.join(cwd, 'src/lib/firebase/admin.ts'));
const { getMemberIdsForAudience } = await jiti.import(path.join(cwd, 'src/lib/chat/channels.ts'));
const { FieldValue } = require('firebase-admin/firestore');

const CHANNEL_ID = 'solar';
const ref = adminDb.collection('chatChannels').doc(CHANNEL_ID);
const existing = await ref.get();
if (existing.exists) {
  const data = existing.data() ?? {};
  const count = Array.isArray(data.memberIds) ? data.memberIds.length : 0;
  console.log(`chatChannels/${CHANNEL_ID} already exists (audience: ${data.audience}, ${count} members). Nothing to do.`);
  process.exit(0);
}

const channelsSnap = await adminDb.collection('chatChannels').get();
const maxOrder = channelsSnap.docs.reduce((max, doc) => {
  const order = doc.data().order;
  return typeof order === 'number' && Number.isFinite(order) ? Math.max(max, order) : max;
}, 0);
const memberIds = await getMemberIdsForAudience('solar');
const doc = {
  id: CHANNEL_ID,
  name: 'Solar',
  description: 'Solar team: leads, consults and closes.',
  audience: 'solar',
  order: maxOrder + 1,
  active: true,
  memberIds,
};

console.log(apply ? 'APPLY: creating the channel\n' : 'DRY RUN: nothing is written (pass --apply to write)\n');
console.log(`chatChannels/${CHANNEL_ID}: name "${doc.name}", audience solar, order ${doc.order}, ${memberIds.length} members`);

if (apply) {
  await ref.create({
    ...doc,
    createdBy: 'script:create-solar-chat-channel',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  console.log('Created.');
} else {
  console.log('Dry run only. Re-run with --apply to write.');
}
process.exit(0);
