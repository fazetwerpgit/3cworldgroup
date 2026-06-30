// Non-destructive end-to-end verification of the onboarding Storage path.
//
// Exercises EXACTLY what the app's upload + review routes rely on:
//   1. Admin SDK bucket write        (mirrors the two upload routes)
//   2. getFiles({ prefix })          (mirrors review route signFolderFiles)
//   3. getSignedUrl (15-min read)    (mirrors review route)
//   4. HTTP fetch of the signed URL  (proves it serves the bytes)
//   5. cleanup (delete the test prefix)
//
// Writes ONLY to a throwaway onboarding/_verify_<ts>/ prefix. Creates no Auth
// users and writes no Firestore. Run after enabling Firebase Storage:
//
//   node scripts/verify-storage.mjs
//
// Exit 0 = the full storage path works. Exit 1 = a step failed (message shown).
// Reads credentials from .env.local using the same shape as src/lib/firebase/admin.ts.

import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';

function loadEnv() {
  let raw;
  try {
    raw = readFileSync('.env.local', 'utf-8');
  } catch {
    console.error('Could not read .env.local from the current directory. Run from the repo root.');
    process.exit(1);
  }
  const env = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    env[m[1]] = v;
  }
  return env;
}

const env = loadEnv();
const bucketName = env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucketName) {
  console.error('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET is not set in .env.local');
  process.exit(1);
}

let privateKey = env.FIREBASE_ADMIN_PRIVATE_KEY || '';
if (!privateKey.includes('-----BEGIN')) {
  privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
}
privateKey = privateKey.replace(/\\n/g, '\n').replace(/\\\\n/g, '\n');

const app = initializeApp({
  credential: cert({
    projectId: env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});

const bucket = getStorage(app).bucket(bucketName);
const stamp = `${Date.now().toString(36)}`;
const folder = `onboarding/_verify_${stamp}/`;
const objectPath = `${folder}file.txt`;
const steps = [];

try {
  console.log(`Bucket: ${bucketName}`);

  const [exists] = await bucket.exists();
  if (!exists) {
    console.error(
      `\nVERIFY_FAIL: bucket "${bucketName}" does not exist.\n` +
        `Enable Firebase Storage for this project (Console -> Build -> Storage -> Get started), ` +
        `then re-run this script.`
    );
    process.exit(1);
  }

  await bucket.file(objectPath).save(Buffer.from('storage-verify'), {
    contentType: 'text/plain',
    resumable: false,
  });
  steps.push('WRITE ok');

  const [files] = await bucket.getFiles({ prefix: folder });
  const names = files.map((f) => f.name.split('/').pop());
  steps.push(`LIST ${files.length} file(s) [${names.join(', ')}]`);
  if (files.length !== 1) throw new Error('expected exactly 1 file under prefix');

  const expires = Date.now() + 15 * 60 * 1000;
  const [url] = await files[0].getSignedUrl({ action: 'read', expires });
  steps.push('SIGN ok (15-min read URL)');

  const resp = await fetch(url);
  const body = await resp.text();
  steps.push(`FETCH status ${resp.status}`);
  if (resp.status !== 200 || body !== 'storage-verify') {
    throw new Error('signed URL did not serve the expected bytes');
  }

  console.log('\nVERIFY_PASS — write, list, sign, and fetch all succeeded.');
} catch (err) {
  console.error('\nVERIFY_FAIL:', err.message);
  process.exitCode = 1;
} finally {
  try {
    await bucket.deleteFiles({ prefix: folder });
    steps.push('CLEANUP deleted test prefix');
  } catch (e) {
    steps.push(`CLEANUP_WARN ${e.message}`);
  }
  for (const s of steps) console.log('  -', s);
}
