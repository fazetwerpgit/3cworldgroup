// One-time backfill: doors a MANAGER added with Add area (areaImports) before the import route
// started stamping them get managerId = that manager, so the houses rules let them see,
// lasso-assign, delete and restore them (managerId == them). Owner and rep imports are left alone.
//
//   node scripts/backfill-manager-area-doors.mjs [--env-dir DIR]           -> DRY RUN (default): reads only
//   node scripts/backfill-manager-area-doors.mjs [--env-dir DIR] --apply   -> write
//
// --env-dir: where .env.local lives. Defaults to the repo root (this script's parent folder); a git
// worktree has none, so point it at the main checkout.
//
// Importer role: the record's createdByRole when stored, else the user's current role
// (users/{createdBy}, knock manager as the import gate decides it).
// Doors: houses with areaImportId == the import id, in its campaign or soft-deleted from it
// (campaignId '_deleted', deleted.campaignId), so the manager can restore them too.
// A door is set ONLY when managerId is null AND assignedRepId is null; everything else is skipped.
// Each write sets { managerId, updatedAt: Date.now() } (epoch ms, as the portal's imports write
// house updatedAt; the app's change listens read number and Timestamp alike) with a lastUpdateTime
// precondition, so a door changed after the read is skipped, never overwritten.
// Output: counts only (no names, addresses or uids).
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { doorAction, importerRole } from './backfill-manager-area-doors.lib.mjs';

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envDirIndex = argv.indexOf('--env-dir');
const envDir = path.resolve(envDirIndex >= 0 && argv[envDirIndex + 1] ? argv[envDirIndex + 1] : repoRoot);
const require = createRequire(repoRoot + '/');

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(envDir);

// House pattern: FIREBASE_SERVICE_ACCOUNT only (base64 or raw JSON).
const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!raw) {
  console.error(`FIREBASE_SERVICE_ACCOUNT is not set (env dir: ${envDir}); cannot authenticate.`);
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

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const app = initializeApp({ credential: cert(serviceAccount) }, 'backfill-manager-area-doors');
const db = getFirestore(app);

const counts = {
  importsScanned: 0,
  managerImports: 0,
  nonManagerImports: 0,
  importerUnknown: 0,
  doorsSeen: 0,
  doorsToSet: 0,
  doorsSet: 0,
};
/** @type {Record<string, number>} */
const skipped = {};
const skip = (reason) => (skipped[reason] = (skipped[reason] ?? 0) + 1);

const imports = await db.collection('areaImports').get();
counts.importsScanned = imports.size;
const users = new Map();
async function userData(uid) {
  if (!users.has(uid)) {
    const snap = await db.collection('users').doc(uid).get();
    users.set(uid, snap.exists ? snap.data() : null);
  }
  return users.get(uid);
}

const toSet = [];
for (const imp of imports.docs) {
  const record = imp.data();
  const uid = typeof record.createdBy === 'string' ? record.createdBy : '';
  const role = importerRole(record, uid ? await userData(uid) : null);
  if (role === null) {
    counts.importerUnknown++;
    continue;
  }
  if (role !== 'manager') {
    counts.nonManagerImports++;
    continue;
  }
  counts.managerImports++;
  const doors = await db.collection('houses').where('areaImportId', '==', imp.id).get();
  for (const d of doors.docs) {
    counts.doorsSeen++;
    const action = doorAction(d.data(), record.campaignId, uid);
    if (action === 'set') toSet.push({ doc: d, uid });
    else skip(action);
  }
}
counts.doorsToSet = toSet.length;

if (apply && toSet.length > 0) {
  const writer = db.bulkWriter();
  // FAILED_PRECONDITION (the door changed after the read) is final; others get the SDK's retries.
  writer.onWriteError((error) => error.code !== 9 && error.failedAttempts < 5);
  const now = Date.now();
  const writes = toSet.map(({ doc, uid }) =>
    writer.update(doc.ref, { managerId: uid, updatedAt: now }, { lastUpdateTime: doc.updateTime }).then(
      () => {
        counts.doorsSet++;
      },
      (error) => skip(error.code === 9 ? 'changed-since-read' : 'write-failed')
    )
  );
  await writer.close();
  await Promise.all(writes);
}

console.log(apply ? 'APPLY' : 'DRY RUN (pass --apply to write)');
console.log(JSON.stringify({ ...counts, skipped }, null, 2));
process.exit(0);
