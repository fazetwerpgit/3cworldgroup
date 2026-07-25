// Security audit probe: hit every route we believe is ungated with NO
// credentials and record what comes back.
//
//   node scripts/audit-open-routes.mjs            -> probe http://localhost:3005
//   BASE=https://... node scripts/audit-open-routes.mjs
//
// Before the hardening pass, routes answering 200 are open to the internet.
// After it, every row below must be 401 (or 403). This script is the
// regression test for the whole effort — it is intentionally dumb and makes
// no assumptions about the implementation.
//
// SAFETY — READ THIS BEFORE ADDING A PROBE.
//
// The dev server is wired to PRODUCTION Firebase via .env.local. A probe
// that sends a well-formed mutating payload to an ungated route would
// really mutate live data — sending `{tiers: []}` to PUT commission would
// wipe the real commission table. So no probe here ever sends a valid body.
//
// Mutating routes are probed with NO body at all. That is a reliable and
// non-destructive discriminator, because every correctly gated route in
// this codebase runs its auth gate BEFORE `await request.json()` (see
// src/app/api/portal/sales/route.ts:126 vs :137):
//
//   401/403  -> the gate ran first and rejected us. Route is protected.
//   anything -> the handler got as far as parsing a body we never sent,
//   else       which means no gate ran. Route is open.
//
// The bodyless request dies in the JSON parse and reaches no write path.
// Keep it that way: never give a mutating probe a valid payload.

const BASE = process.env.BASE || 'http://localhost:3005';

// [method, path, sendBody]. sendBody is always false for mutating methods.
const PROBES = [
  ['PUT', '/api/portal/profile', false],
  ['GET', '/api/portal/commission?userId=audit-probe-uid', null],
  ['PUT', '/api/portal/commission', false],
  ['GET', '/api/portal/calls', null],
  ['GET', '/api/portal/pipeline', null],
  ['GET', '/api/portal/pipeline/channels', null],
  ['POST', '/api/portal/pipeline/field-train', false],
  ['POST', '/api/portal/pipeline/decommission', false],
  ['GET', '/api/portal/email-templates', null],
  ['GET', '/api/portal/recruiting/invites', null],
  ['POST', '/api/portal/recruiting/convert', false],
  ['GET', '/api/portal/forms/payroll-dispute/review', null],
  ['GET', '/api/portal/forms/bug-report/review', null],
  ['GET', '/api/portal/forms/fiber-report/review', null],
  ['GET', '/api/portal/forms/leads-request/review', null],
  ['GET', '/api/portal/forms/manager-interview/review', null],
  ['GET', '/api/portal/forms/expedite-order/review', null],
  ['GET', '/api/portal/training', null],
  ['GET', '/api/portal/training/probe-nonexistent-id', null],
];

// Routes that are public BY DESIGN. Listed so the report distinguishes
// "intentionally open" from "accidentally open" rather than silently
// omitting them.
const INTENTIONALLY_PUBLIC = [
  ['GET', '/api/public/applications', null],
];

const AUTH_OK = new Set([401, 403]);

async function probe(method, path, body) {
  const url = BASE + path;
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    let sample = '';
    try {
      sample = (await res.text()).slice(0, 160).replace(/\s+/g, ' ');
    } catch {
      sample = '<unreadable>';
    }
    return { status: res.status, sample };
  } catch (err) {
    return { status: 0, sample: 'REQUEST FAILED: ' + err.message };
  }
}

const pad = (s, n) => String(s).padEnd(n);

console.log('Probing ' + BASE + ' with NO credentials\n');

let open = 0;
const rows = [];
for (const [method, path, body] of PROBES) {
  const { status, sample } = await probe(method, path, body);
  const guarded = AUTH_OK.has(status);
  if (!guarded && status !== 0) open += 1;
  rows.push({ method, path, status, guarded, sample });
  console.log(
    `${guarded ? 'GUARDED' : status === 0 ? 'NOCONN ' : 'OPEN   '}  ${pad(method, 6)} ${pad(path, 56)} ${status}`
  );
}

console.log('\n--- intentionally public (expected to answer) ---');
for (const [method, path, body] of INTENTIONALLY_PUBLIC) {
  const { status } = await probe(method, path, body);
  console.log(`PUBLIC   ${pad(method, 6)} ${pad(path, 56)} ${status}`);
}

console.log(`\n${open} of ${PROBES.length} routes answered without credentials.`);

if (open > 0) {
  console.log('\nResponse samples from open routes (what an attacker receives):');
  for (const r of rows.filter((r) => !r.guarded && r.status !== 0)) {
    console.log(`\n  ${r.method} ${r.path} -> ${r.status}`);
    console.log(`  ${r.sample}`);
  }
}

process.exit(open > 0 ? 1 : 0);
