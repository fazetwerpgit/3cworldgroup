// Read-only diagnostic: print a rep's sale-day history and the streak the
// leaderboard would compute, to explain a suspicious streak badge.
//   node scripts/diagnose-streak.mjs --name "Braeden Crouse" [--env <envfile>]
import { readFileSync } from 'node:fs';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const argValue = (flag) => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const name = argValue('--name');
if (!name) {
  console.error('Usage: node scripts/diagnose-streak.mjs --name "Full Name" [--env <envfile>]');
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

// Same day-key logic as src/lib/leaderboard/history.ts.
const dayKey = (date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
const addDaysToKey = (key, days) => {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const isWeekendKey = (key) => [0, 6].includes(new Date(`${key}T12:00:00Z`).getUTCDay());

// Find the rep.
const users = await db.collection('users').get();
const matches = users.docs.filter(
  (d) => (d.get('displayName') ?? '').toLowerCase() === name.toLowerCase()
);
if (matches.length !== 1) {
  console.error(`Found ${matches.length} users matching "${name}" — aborting.`);
  process.exit(1);
}
const uid = matches[0].id;
console.log(`User: ${matches[0].get('displayName')} (${uid})`);

// Their sales, any status — the leaderboard uses approved-only, so print both.
const sales = await db.collection('sales').where('salesRepId', '==', uid).get();
console.log(`\nSales on file: ${sales.size}`);
const rows = sales.docs
  .map((d) => {
    const s = d.data();
    const saleDate = s.saleDate?.toDate ? s.saleDate.toDate() : new Date(s.saleDate);
    return { id: d.id, key: dayKey(saleDate), iso: saleDate.toISOString(), status: s.status, points: s.totalPoints ?? 0 };
  })
  .sort((a, b) => a.iso.localeCompare(b.iso));
for (const r of rows) {
  console.log(`  ${r.key}  (${r.iso})  status=${r.status}  points=${r.points}  ${r.id}`);
}

// Replay the leaderboard's streak walk on approved sales.
const saleDays = new Set(rows.filter((r) => r.status === 'approved').map((r) => r.key));
const todayKey = dayKey(new Date());
console.log(`\nToday (ET): ${todayKey}. Approved sale days: ${[...saleDays].sort().join(', ') || 'none'}`);
let streak = 0;
let key = todayKey;
for (let i = 0; i < 365; i++) {
  const has = saleDays.has(key);
  if (has) streak += 1;
  else if (key !== todayKey && !isWeekendKey(key)) {
    console.log(`  walk stops at ${key} (saleless weekday). `);
    break;
  }
  if (i < 14) console.log(`  ${key}: ${has ? 'SALE' : isWeekendKey(key) ? 'weekend skip' : key === todayKey ? 'today grace' : '-'}`);
  key = addDaysToKey(key, -1);
}
console.log(`\nComputed streakDays (what the leaderboard shows): ${streak}`);
