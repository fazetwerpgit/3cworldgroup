#!/usr/bin/env node
/**
 * Guard against `firebase deploy --only firestore:indexes` silently deleting a
 * live index.
 *
 * firestore.indexes.json is not an "add these" list — it is the DESIRED STATE.
 * Anything in production that is missing from the file gets proposed for
 * DELETION on the next deploy (and is deleted outright with --force). Indexes
 * created from the Firebase console — which is what the "create index" link in
 * a Firestore FAILED_PRECONDITION error does — never make it into the file, so
 * prod drifts and the next deploy quietly offers to undo it.
 *
 * Run this BEFORE every index deploy:
 *   npm run indexes:check
 *
 * Exit 0 = the file is a superset of prod, deploy is purely additive.
 * Exit 1 = prod has an index the file would delete. Copy the printed JSON into
 *          firestore.indexes.json (or delete it on purpose), then re-run.
 *
 * Composite indexes only. Single-field overrides live behind a different API
 * (collectionGroups/{cg}/fields) and are not checked here.
 */
import { readFileSync } from 'node:fs';
import nextEnv from '@next/env';
import { GoogleAuth } from 'google-auth-library';

nextEnv.loadEnvConfig(process.cwd());

const raw = (process.env.FIREBASE_SERVICE_ACCOUNT ?? '').trim();
if (!raw) {
  console.error('FIREBASE_SERVICE_ACCOUNT is not set. Load .env.local first.');
  process.exit(2);
}
// The value is stored base64-encoded in some environments and as raw JSON in others.
const sa = JSON.parse(raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8'));

const auth = new GoogleAuth({
  credentials: sa,
  scopes: ['https://www.googleapis.com/auth/cloud-platform'],
});
const client = await auth.getClient();

// The list endpoint ignores the collectionGroup path segment and returns every
// composite index in the database, so one call is the whole picture. The real
// collection group only appears in the resource name.
const { data } = await client.request({
  url: `https://firestore.googleapis.com/v1/projects/${sa.project_id}/databases/(default)/collectionGroups/-/indexes`,
});
const live = data.indexes ?? [];

// Prod appends a trailing __name__ field that the config file always omits.
const signature = (collectionGroup, queryScope, fields) =>
  [
    collectionGroup,
    queryScope ?? 'COLLECTION',
    ...fields
      .filter((f) => f.fieldPath !== '__name__')
      .map((f) => `${f.fieldPath}:${f.order ?? f.arrayConfig}`),
  ].join(' | ');

const liveEntries = live.map((index) => {
  const collectionGroup = index.name.split('/collectionGroups/')[1].split('/')[0];
  return {
    signature: signature(collectionGroup, index.queryScope, index.fields),
    state: index.state,
    json: {
      collectionGroup,
      queryScope: index.queryScope,
      fields: index.fields
        .filter((f) => f.fieldPath !== '__name__')
        .map((f) => (f.order ? { fieldPath: f.fieldPath, order: f.order } : { fieldPath: f.fieldPath, arrayConfig: f.arrayConfig })),
    },
  };
});

const config = JSON.parse(readFileSync('firestore.indexes.json', 'utf8'));
const configSignatures = new Set(
  (config.indexes ?? []).map((i) => signature(i.collectionGroup, i.queryScope, i.fields)),
);
const liveSignatures = new Set(liveEntries.map((e) => e.signature));

const wouldDelete = liveEntries.filter((e) => !configSignatures.has(e.signature));
const wouldCreate = (config.indexes ?? []).filter(
  (i) => !liveSignatures.has(signature(i.collectionGroup, i.queryScope, i.fields)),
);

console.log(`project ${sa.project_id} — ${live.length} live, ${config.indexes?.length ?? 0} in file\n`);

if (wouldCreate.length) {
  console.log(`Will be CREATED on deploy (${wouldCreate.length}):`);
  for (const i of wouldCreate) {
    console.log(`  ${signature(i.collectionGroup, i.queryScope, i.fields)}`);
  }
  console.log('');
}

if (!wouldDelete.length) {
  console.log('OK — nothing in production is missing from the file. Deploy is additive.');
  process.exit(0);
}

console.error(`DANGER — ${wouldDelete.length} live index(es) are NOT in firestore.indexes.json.`);
console.error('A deploy will offer to DELETE these (and will delete them with --force):\n');
for (const e of wouldDelete) {
  console.error(`  [${e.state}] ${e.signature}`);
}
console.error('\nAdd them to the "indexes" array (or delete them deliberately), then re-run:\n');
console.error(JSON.stringify(wouldDelete.map((e) => e.json), null, 2));
process.exit(1);
