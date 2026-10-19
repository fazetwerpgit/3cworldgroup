// Re-sync chatChannels memberIds with the same server logic as
// POST /api/portal/chat/channels/sync (src/lib/chat/channels.ts:
// planChatChannelSync + applyChatChannelSync). Audience channels get their
// role-derived members plus surviving manual extras; the App Review demo
// sandbox (chatChannels/app-review, demoSandbox: true) keeps demo accounts
// plus Jacob only, so anyone else in its memberIds is dropped.
//
//   node scripts/sync-chat-channels.mjs           -> DRY RUN (default): reads only
//   node scripts/sync-chat-channels.mjs --apply   -> write the new memberIds
//
// Prints member COUNTS per channel, never names or uids. Run from the repo root.
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
const jiti = createJiti(pathToFileURL(path.join(cwd, 'scripts', 'sync-chat-channels.mjs')).href, {
  alias: { '@': path.join(cwd, 'src') },
});
const { planChatChannelSync, applyChatChannelSync } = await jiti.import(path.join(cwd, 'src/lib/chat/channels.ts'));

const plan = await planChatChannelSync();

console.log(apply ? 'APPLY: writing memberIds\n' : 'DRY RUN: nothing is written (pass --apply to write)\n');
let changed = 0;
for (const item of plan) {
  const before = new Set(item.before);
  const after = new Set(item.memberIds);
  const removed = [...before].filter((id) => !after.has(id)).length;
  const added = [...after].filter((id) => !before.has(id)).length;
  if (removed || added) changed += 1;
  const tag = item.sandbox ? ' [demo sandbox]' : '';
  console.log(
    `${item.channelId}${tag}: ${before.size} -> ${after.size} members` +
      (removed || added ? ` (-${removed} removed, +${added} added)` : ' (no change)')
  );
}
console.log(`\n${plan.length} channel(s), ${changed} with membership changes.`);

if (apply) {
  const { channelsSynced } = await applyChatChannelSync(plan);
  console.log(`Wrote memberIds on ${channelsSynced} channel(s).`);
} else {
  console.log('Dry run only. Re-run with --apply to write.');
}
process.exit(0);
