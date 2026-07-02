// One-time bootstrap: create the chatChannels/{id} docs with role-based memberIds
// so the realtime listeners (which read via member-based Firestore rules) work.
// Safe to re-run — it re-syncs membership from the current active users.
//   node scripts/bootstrap-chat-channels.mjs
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

for (const line of readFileSync('.env.local', 'utf-8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
let pk = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
if (!pk.includes('-----BEGIN')) pk = Buffer.from(pk, 'base64').toString('utf-8');
pk = pk.replace(/\\n/g, '\n');
initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
    clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    privateKey: pk,
  }),
});
const db = getFirestore();

// Mirror of src/types/chat.ts CHAT_CHANNELS + canAccessChatChannel (kept in sync).
const CHANNELS = [
  { id: 'all-company', name: 'All Company', description: 'Company-wide updates and quick coordination.', audience: 'all', order: 1, active: true },
  { id: 'new-reps', name: 'New Reps', description: 'Onboarding help, first-week questions, and checklist guidance.', audience: 'field', order: 2, active: true },
  { id: 'training-updates', name: 'Training Updates', description: 'Online training, call reminders, and field-readiness notes.', audience: 'all', order: 3, active: true },
  { id: 'managers', name: 'Managers', description: 'Manager alignment, field-train requests, and rep support.', audience: 'managers', order: 4, active: true },
];
const PLATFORM = ['admin', 'operations'];
const FIELD = ['entry_rep', 'l1_manager', 'l2_manager'];
function resolveRoles(rawRole, rawFieldRole) {
  const fieldRole = FIELD.includes(rawFieldRole) ? rawFieldRole : undefined;
  if (PLATFORM.includes(rawRole)) return { role: rawRole, fieldRole };
  if (FIELD.includes(rawRole)) return { role: undefined, fieldRole: fieldRole ?? rawRole };
  return { role: undefined, fieldRole };
}
function canAccess(channel, role, fieldRole) {
  if (!channel.active) return false;
  if (role === 'admin' || role === 'operations') return true;
  if (channel.audience === 'all') return !!role || !!fieldRole;
  if (channel.audience === 'field') return !!fieldRole;
  if (channel.audience === 'managers') return fieldRole === 'l1_manager' || fieldRole === 'l2_manager';
  if (channel.audience === 'platform') return role === 'admin' || role === 'operations';
  return false;
}

const usersSnap = await db.collection('users').where('status', '==', 'active').get();
const activeUsers = usersSnap.docs.map((d) => {
  const data = d.data();
  return { uid: d.id, ...resolveRoles(data.role, data.fieldRole) };
});
console.log(`Active users: ${activeUsers.length}`);

for (const channel of CHANNELS) {
  const memberIds = activeUsers.filter((u) => canAccess(channel, u.role, u.fieldRole)).map((u) => u.uid);
  await db.collection('chatChannels').doc(channel.id).set(
    { ...channel, memberIds, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  console.log(`  ${channel.id}: ${memberIds.length} members`);
}
console.log('\nChat channels bootstrapped. Realtime chat is live.');
