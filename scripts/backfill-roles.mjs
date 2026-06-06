// Piece 1b backfill: migrate legacy/misplaced role values to the split model.
//   node scripts/backfill-roles.mjs           -> dry run (report only)
//   node scripts/backfill-roles.mjs --apply   -> write changes
//
// Mapping (mirrors the read-time shim in src/types/auth.ts):
//   role: 'sales_rep'     -> fieldRole: 'entry_rep',  role deleted
//   role: 'sales_manager' -> fieldRole: 'l1_manager', role deleted
//   role: <field value>   -> fieldRole: <value>,      role deleted
//   role: 'admin'|'operations' -> untouched
// Also backfills reportsToId from managerId when missing.
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

let privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!privateKey.includes('-----BEGIN')) {
  privateKey = Buffer.from(privateKey, 'base64').toString('utf-8');
}
privateKey = privateKey.replace(/\\n/g, '\n');

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey,
  }),
});

const LEGACY_ROLE_MAP = { sales_rep: 'entry_rep', sales_manager: 'l1_manager' };
const PLATFORM_ROLES = ['admin', 'operations'];
const FIELD_ROLES = ['entry_rep', 'l1_manager', 'l2_manager'];

const apply = process.argv.includes('--apply');
const db = getFirestore();
const snap = await db.collection('users').get();

let changed = 0;
for (const doc of snap.docs) {
  const d = doc.data();
  const update = {};
  const notes = [];

  if (d.role && LEGACY_ROLE_MAP[d.role]) {
    update.fieldRole = d.fieldRole ?? LEGACY_ROLE_MAP[d.role];
    update.role = FieldValue.delete();
    notes.push(`role '${d.role}' -> fieldRole '${update.fieldRole}'`);
  } else if (d.role && FIELD_ROLES.includes(d.role)) {
    update.fieldRole = d.fieldRole ?? d.role;
    update.role = FieldValue.delete();
    notes.push(`field value in role column -> fieldRole '${update.fieldRole}'`);
  } else if (d.role && !PLATFORM_ROLES.includes(d.role)) {
    notes.push(`UNKNOWN role value '${d.role}' - skipped, review manually`);
  }

  if (d.managerId && !d.reportsToId) {
    update.reportsToId = d.managerId;
    notes.push(`reportsToId <- managerId '${d.managerId}'`);
  }

  const willWrite = Object.keys(update).length > 0 && !notes.some((n) => n.startsWith('UNKNOWN'));
  console.log(
    `${doc.id} | ${d.email ?? '(no email)'} | role=${d.role ?? '-'} fieldRole=${d.fieldRole ?? '-'}` +
      (notes.length ? ` | ${notes.join('; ')}` : ' | OK, no change')
  );

  if (willWrite && apply) {
    update.updatedAt = new Date();
    await doc.ref.update(update);
    changed++;
  } else if (willWrite) {
    changed++;
  }
}

console.log(apply ? `\nAPPLIED: ${changed} doc(s) updated.` : `\nDRY RUN: ${changed} doc(s) would change. Re-run with --apply.`);
