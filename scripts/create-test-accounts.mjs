// Create (or refresh) the owner-approved QA test accounts on prod. Each one is
// a real, active portal user with users/{uid}.testAccount === true, so its
// sales, solar leads and bookings stay out of everyone else's views and it
// joins no chat channel by role (src/lib/users/demoAccount.ts).
//
//   node scripts/create-test-accounts.mjs [--env-dir DIR]           -> DRY RUN (default): reads only
//   node scripts/create-test-accounts.mjs [--env-dir DIR] --apply   -> create Auth users + write users docs
//
// --env-dir: where .env.local lives (a git worktree has none; point it at the
// main checkout). Defaults to the current directory.
//
// The users doc mirrors what the portal writes for a real account: self-signup
// ({email (lowercase), displayName, status, createdAt}; src/contexts/AuthContext)
// plus the admin approval (src/app/api/portal/auth/users/[id]: fieldRole or
// solarRole, managerId + reportsToId, status 'active', activatedAt, updatedAt).
//
// Idempotent: an email that already has an Auth user keeps its uid and password;
// only the users doc fields below are (re)written, with merge.
//
// ONE shared password (crypto, 32 chars) lives ONLY in the scratchpad file
// below (chmod 600), next to the four emails. It is never printed. A re-run
// reuses the password already in that file. Output: uid prefixes and emails.
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const PASSWORD_FILE =
  '/tmp/claude-1000/-home-fazetwerpnerd69-dev-3cworldgroup/66dde3b2-ee36-4332-8fdc-e60b5205300c/scratchpad/test-accounts.txt';

const ACCOUNTS = [
  { key: 'mgr', email: 'jacobmyers692+chompen-mgr@gmail.com', displayName: 'Test Manager', fieldRole: 'l1_manager' },
  { key: 'rep', email: 'jacobmyers692+chompen-rep@gmail.com', displayName: 'Test Rep', fieldRole: 'ae_tier_1', reportsTo: 'mgr' },
  { key: 'setter', email: 'jacobmyers692+chompen-setter@gmail.com', displayName: 'Test Setter', solarRole: 'entry_canvasser' },
  { key: 'closer', email: 'jacobmyers692+chompen-closer@gmail.com', displayName: 'Test Closer', solarRole: 'canvass_closer' },
];

const argv = process.argv.slice(2);
const apply = argv.includes('--apply');
const envDirIndex = argv.indexOf('--env-dir');
const envDir = path.resolve(envDirIndex >= 0 && argv[envDirIndex + 1] ? argv[envDirIndex + 1] : process.cwd());
const cwd = process.cwd();
const require = createRequire(cwd + '/');

const { loadEnvConfig } = require('@next/env');
loadEnvConfig(envDir);

// House pattern: FIREBASE_SERVICE_ACCOUNT only (base64 or raw JSON).
// FIREBASE_ADMIN_PRIVATE_KEY is truncated in every environment here.
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
const { getAuth } = require('firebase-admin/auth');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const app = initializeApp({ credential: cert(serviceAccount) }, 'create-test-accounts');
const auth = getAuth(app);
const db = getFirestore(app);

/** The shared password: the one already in the file, else a new one written there (600). */
function sharedPassword() {
  if (fs.existsSync(PASSWORD_FILE)) {
    const line = fs.readFileSync(PASSWORD_FILE, 'utf8').split('\n').find((l) => l.startsWith('password: '));
    const existing = line?.slice('password: '.length).trim();
    if (existing && existing.length >= 24) return existing;
  }
  const password = randomBytes(24).toString('base64url'); // 32 chars
  fs.mkdirSync(path.dirname(PASSWORD_FILE), { recursive: true });
  const body = [
    'QA test accounts (users/{uid}.testAccount: true). Shared password for all four.',
    `password: ${password}`,
    ...ACCOUNTS.map((a) => `${a.key}: ${a.email}`),
    '',
  ].join('\n');
  fs.writeFileSync(PASSWORD_FILE, body, { mode: 0o600 });
  fs.chmodSync(PASSWORD_FILE, 0o600);
  return password;
}

async function existingUser(email) {
  try {
    return await auth.getUserByEmail(email);
  } catch (error) {
    if (error?.code === 'auth/user-not-found') return null;
    throw error;
  }
}

const short = (uid) => (uid ? `${uid.slice(0, 6)}…` : '(new)');

const password = sharedPassword();
console.log(apply ? 'APPLY: creating/updating test accounts\n' : 'DRY RUN: nothing is written (pass --apply to write)\n');
console.log(`Password file: ${PASSWORD_FILE} (600)\n`);

const uids = {};
for (const account of ACCOUNTS) {
  const found = await existingUser(account.email);
  let uid = found?.uid ?? null;
  let action = found ? 'exists: update doc only' : 'create Auth user + doc';

  if (apply && !found) {
    const created = await auth.createUser({
      email: account.email,
      password,
      displayName: account.displayName,
      emailVerified: true,
    });
    uid = created.uid;
    action = 'created';
  }
  uids[account.key] = uid;

  const managerUid = account.reportsTo ? uids[account.reportsTo] : undefined;
  const now = new Date();
  const docRef = uid ? db.collection('users').doc(uid) : null;
  const existingDoc = docRef ? await docRef.get() : null;
  const doc = {
    // Self-signup fields.
    email: account.email.toLowerCase(),
    displayName: account.displayName,
    status: 'active',
    // Approval fields.
    ...(account.fieldRole ? { fieldRole: account.fieldRole } : {}),
    ...(account.solarRole ? { solarRole: account.solarRole } : {}),
    ...(account.reportsTo ? { managerId: managerUid ?? null, reportsToId: managerUid ?? null } : {}),
    testAccount: true,
    updatedAt: now,
    // First write only: keep the original stamps on a re-run.
    ...(existingDoc?.exists && existingDoc.get('createdAt') ? {} : { createdAt: now }),
    ...(existingDoc?.exists && existingDoc.get('activatedAt') ? {} : { activatedAt: FieldValue.serverTimestamp() }),
  };

  if (apply) await docRef.set(doc, { merge: true });

  const roleText = account.fieldRole ? `fieldRole ${account.fieldRole}` : `solarRole ${account.solarRole}`;
  const managerText = account.reportsTo ? `, reports to ${short(managerUid)}` : '';
  console.log(`${short(uid)}  ${account.email}  ${roleText}${managerText}  [${action}${existingDoc?.exists ? ', doc exists' : ''}]`);
}

console.log(apply ? '\nDone.' : '\nDry run complete. Re-run with --apply to write.');
process.exit(0);
