// Security audit probe: discovers every route.ts under src/app/api, extracts
// which HTTP methods it exports, and probes the GETs with NO credentials.
//
//   node scripts/audit-open-routes.mjs            -> probe http://localhost:3005
//   BASE=https://... node scripts/audit-open-routes.mjs
//
// -----------------------------------------------------------------------------
// SAFETY — READ THIS BEFORE TOUCHING THIS FILE.
//
// The dev server is wired to PRODUCTION Firebase via .env.local. This script
// NEVER sends a request to a mutating route (POST/PUT/PATCH/DELETE) — not with
// no body, not with a well-formed one. An earlier version relied on "a bodyless
// request dies in JSON.parse before any write" as the safety net for mutating
// probes; that is fragile (a route that reads a query param instead of a body,
// or writes before it awaits request.json(), breaks the invariant silently and
// nobody would notice until it wrote to production). The rule that replaces it
// is load-bearing and much simpler: THIS SCRIPT ONLY SENDS GET REQUESTS. Every
// POST/PUT/PATCH/DELETE route discovered below is listed as NOT PROBED and
// never touched, full stop. Do not add a mutating probe to "improve coverage."
// -----------------------------------------------------------------------------
//
// Coverage, not a hand list: this used to be a hand-authored array of paths,
// which is exactly how GET /api/portal/training stayed invisible to this
// script while it was open to the internet — see finding #6 in
// docs/security/2026-07-25-findings.md. "0 of 17 routes answered without
// credentials, exit 0" was true and simultaneously missed the one portal route
// that did, because the list was never derived from anything.
//
// This version walks the real route table under src/app/api and probes every
// GET it finds BY DEFAULT. A new route is covered automatically the day it's
// added; making it invisible to this script requires someone to consciously
// list it in ALLOWED_OPEN with a reason, not just forget to add a row.

import { readdirSync, statSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, '..');
const API_ROOT = path.join(REPO_ROOT, 'src', 'app', 'api');
const BASE = process.env.BASE || 'http://localhost:3005';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

// ---------------------------------------------------------------------------
// 1. Discover every route.ts and which HTTP methods it exports.
//
// This is a regex over file text, not a TypeScript parse — fine for a dev-time
// audit, not fine to trust blindly. Block comments are stripped first so a
// commented-out `export async function POST_DISABLED(...)` (see
// portal/auth/signup/route.ts) can't be mistaken for a live POST, and the
// method regex requires the exact method name immediately followed by `(` so
// POST_DISABLED itself never matches POST. If a route.ts uses some other
// export shape (default export, re-exported handler, etc.) it will be
// silently invisible here — grep for `export default` / `export {` under
// src/app/api if this script's discovered-pairs count ever looks low.
// ---------------------------------------------------------------------------

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, files);
    } else if (entry === 'route.ts') {
      files.push(full);
    }
  }
  return files;
}

function extractMethods(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');
  const methods = [];
  for (const method of HTTP_METHODS) {
    const re = new RegExp(`^export\\s+async\\s+function\\s+${method}\\s*\\(`, 'm');
    if (re.test(stripped)) methods.push(method);
  }
  return methods;
}

// [id] / [channelId] / [token] -> probe-id / probe-channelId / probe-token.
// No catch-all ([...slug]) or route-group ((group)) segments exist under
// src/app/api today; this does not special-case them.
function toApiPath(fileDir) {
  const rel = path.relative(API_ROOT, fileDir);
  const segments = rel.split(path.sep).filter(Boolean);
  const urlSegments = segments.map((seg) => {
    const m = seg.match(/^\[(.+)\]$/);
    return m ? `probe-${m[1]}` : seg;
  });
  return '/api/' + urlSegments.join('/');
}

const routeFiles = walk(API_ROOT).sort();
const table = []; // { method, apiPath, file }
for (const file of routeFiles) {
  const apiPath = toApiPath(path.dirname(file));
  for (const method of extractMethods(file)) {
    table.push({ method, apiPath, file: path.relative(REPO_ROOT, file) });
  }
}

// ---------------------------------------------------------------------------
// 2. Known exceptions to "every GET must require credentials."
// ---------------------------------------------------------------------------

// Some self/management-scoped GETs read a required query param and 400 on it
// BEFORE their auth gate runs, so a bare probe gets 400 — neither GUARDED nor
// OPEN, just uninformative. Append a param so the request actually reaches the
// gate. Confirmed live: without the param -> 400; with a bogus one -> 401.
const REQUIRES_QUERY = {
  '/api/portal/notifications': 'userId=probe-uid',
  '/api/portal/onboarding': 'userId=probe-uid',
  '/api/portal/training/progress': 'userId=probe-uid',
};

// Routes that legitimately answer a credential-free request. This is the ONLY
// sanctioned way to make a route invisible to the OPEN/FAIL check below — every
// entry needs a reason, and a route not listed here that returns 2xx with no
// bearer token is a failure, not an oversight to quietly tolerate.
const ALLOWED_OPEN = [
  ['GET', '/api/public/onboarding/probe-token', 'single-use invite token in the path, SHA-256-hashed and matched server-side — not a bearer token'],
  ['POST', '/api/public/onboarding/probe-token', 'same invite-token auth as the GET above'],
  ['POST', '/api/public/onboarding/probe-token/upload', 'same invite-token auth'],
  ['POST', '/api/webhooks/esign', 'verifies a request signature, not a bearer token'],
  ['GET', '/api/cron/onboarding-nudges', 'checks CRON_SECRET'],
  ['POST', '/api/portal/auth/signup', 'intentionally unauthenticated (currently hard-disabled server-side, returns 403 to everyone regardless)'],
  ['POST', '/api/portal/auth/signup-notify', 'intentionally unauthenticated'],
  ['POST', '/api/public/applications', 'intentionally unauthenticated'],
];
const allowedOpenReason = new Map(ALLOWED_OPEN.map(([m, p, why]) => [`${m} ${p}`, why]));

// ---------------------------------------------------------------------------
// 3. Probe every discovered GET. Never touch a mutating route.
// ---------------------------------------------------------------------------

async function probeGet(apiPath) {
  const query = REQUIRES_QUERY[apiPath];
  const url = BASE + apiPath + (query ? `?${query}` : '');
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' });
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

const AUTH_OK = new Set([401, 403]);

// GUARDED      -> 401/403, the gate ran and rejected us. What we want to see.
// PUBLIC       -> in ALLOWED_OPEN; reported, not judged.
// OPEN         -> 2xx with no credentials and not documented as public. FAILURE.
// INCONCLUSIVE -> anything else (400/404/500/3xx/...). Not a pass — a route
//                 that 500s on a bad path is failing closed today, not proven
//                 gated; a route that 404s might be gated or might just not
//                 exist at this synthetic id. Surfaced distinctly on purpose.
// NOCONN       -> couldn't reach BASE at all.
function classify(status, allowed) {
  if (status === 0) return 'NOCONN';
  if (allowed) return 'PUBLIC';
  if (AUTH_OK.has(status)) return 'GUARDED';
  if (status >= 200 && status < 300) return 'OPEN';
  return 'INCONCLUSIVE';
}

const pad = (s, n) => String(s).padEnd(n);

console.log(`Probing ${BASE} with NO credentials`);
console.log(`Discovered ${table.length} route+method pairs across ${routeFiles.length} route.ts files.\n`);

const getPairs = table.filter((r) => r.method === 'GET');
const mutatingPairs = table.filter((r) => r.method !== 'GET');

const counts = { GUARDED: 0, PUBLIC: 0, OPEN: 0, INCONCLUSIVE: 0, NOCONN: 0 };
const openFailures = [];

console.log('--- GET pairs (probed) ---');
for (const { method, apiPath } of getPairs.sort((a, b) => a.apiPath.localeCompare(b.apiPath))) {
  const allowed = allowedOpenReason.has(`${method} ${apiPath}`);
  const { status, sample } = await probeGet(apiPath);
  const verdict = classify(status, allowed);
  counts[verdict] += 1;
  if (verdict === 'OPEN') openFailures.push({ method, apiPath, status, sample });
  console.log(`${pad(verdict, 12)} ${pad(method, 6)} ${pad(apiPath, 56)} ${status}`);
}

console.log('\n--- mutating pairs (NOT PROBED — see safety note at the top of this file) ---');
for (const { method, apiPath } of mutatingPairs.sort((a, b) => a.apiPath.localeCompare(b.apiPath))) {
  const reason = allowedOpenReason.get(`${method} ${apiPath}`);
  const note = reason ? `mutating, never probed (also documented open: ${reason})` : 'mutating, never probed';
  console.log(`${pad('NOT PROBED', 12)} ${pad(method, 6)} ${pad(apiPath, 56)} ${note}`);
}

const probedCount = getPairs.length;
const coverageLine =
  `${probedCount} of ${table.length} GET pairs probed, ` +
  `${mutatingPairs.length} mutating pairs not probed, ` +
  `${counts.GUARDED} GUARDED, ${counts.PUBLIC} PUBLIC, ` +
  `${counts.INCONCLUSIVE} INCONCLUSIVE, ${counts.NOCONN} NOCONN, ${counts.OPEN} OPEN.`;

console.log(`\n${coverageLine}`);

if (openFailures.length > 0) {
  console.log('\nResponse samples from OPEN routes (what an attacker receives with no credentials):');
  for (const r of openFailures) {
    console.log(`\n  ${r.method} ${r.apiPath} -> ${r.status}`);
    console.log(`  ${r.sample}`);
  }
}

// A run where every probe failed to connect proves nothing and must not read
// as a pass — that is the same "green audit, false confidence" failure mode
// this rewrite exists to close, just at the transport layer instead of the
// route-list layer.
const allNoconn = probedCount > 0 && counts.NOCONN === probedCount;
if (allNoconn) {
  console.log(`\nCould not reach ${BASE} on any probe — nothing was verified. Is the dev server running?`);
}

const failed = counts.OPEN > 0 || allNoconn;
process.exit(failed ? 1 : 0);
