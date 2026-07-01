// One-command E2E run: create bots -> run all form tests -> clean up.
// The bot-password secret is generated in-memory here and passed to every child
// process via env — it is NEVER written to disk or the repo.
//
//   node scripts/e2e-run.mjs
//   E2E_BASE_URL=https://your-site npm run e2e:all
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';

const secret = `QaE2e-${crypto.randomBytes(12).toString('hex')}`;
const baseUrl = process.env.E2E_BASE_URL || 'https://3cworldgroup.vercel.app';

const env = {
  ...process.env,
  E2E_BOT_SECRET: secret,
  E2E_BASE_URL: baseUrl,
};

function step(label, cmd, args) {
  console.log(`\n=== ${label} ===`);
  const r = spawnSync(cmd, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  return r.status ?? 1;
}

console.log(`E2E run against: ${baseUrl}`);

// 1) Create / reset the QA bot pool.
if (step('1/3  Create QA test bots', 'node', ['scripts/e2e-create-test-user.mjs']) !== 0) {
  console.error('Bot setup failed — aborting.');
  process.exit(1);
}

// 2) Run the Playwright suite (all forms x all bots). Capture pass/fail but ALWAYS
//    proceed to cleanup so we never leave test data behind.
const testStatus = step('2/3  Run browser tests', 'npx', ['playwright', 'test']);

// 3) Always clean up: delete bot submissions/notifications AND the bots themselves.
step('3/3  Clean up test data + bots', 'node', ['scripts/e2e-cleanup.mjs', '--delete-user']);

console.log(`\n${testStatus === 0 ? '✅ All E2E tests passed.' : '❌ Some E2E tests failed (see output above). Test data was still cleaned up.'}`);
process.exit(testStatus);
