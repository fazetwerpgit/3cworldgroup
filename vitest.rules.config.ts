import { defineConfig } from 'vitest/config';

// Rules tests need the Firestore emulator, so they are deliberately kept out of
// the default `npm test` config (src/**/*.test.ts) and run through
// `npm run test:rules`, which wraps them in `firebase emulators:exec`. The older
// src/**/*.rules.test.ts suites (skipped in `npm test` without FIRESTORE_EMULATOR_HOST)
// run here too, since emulators:exec sets that variable.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts', 'src/**/*.rules.test.ts'],
    testTimeout: 20000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});
