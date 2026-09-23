import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildRepDigest } from './digest';
import { busyWeekInput, lightWeekInput } from './fixtures';
import { PRODUCTION_SITE_URL, renderWeeklyInstallsEmail } from './render';

// Writes the two sample emails (FIXTURE data only) to .tmpshots/email/ for a
// visual check. Skipped unless asked for:
//   WEEKLY_INSTALLS_RENDER_SAMPLES=1 npx vitest run src/lib/weeklyInstalls/samples.test.ts

describe.skipIf(!process.env.WEEKLY_INSTALLS_RENDER_SAMPLES)('weekly installs sample renders', () => {
  it('writes the busy and light week samples', () => {
    const dir = path.resolve(process.cwd(), '.tmpshots/email');
    mkdirSync(dir, { recursive: true });
    for (const [name, input] of [
      ['busy-week', busyWeekInput()],
      ['light-week', lightWeekInput()],
    ] as const) {
      const email = renderWeeklyInstallsEmail(buildRepDigest(input), { baseUrl: PRODUCTION_SITE_URL });
      writeFileSync(path.join(dir, `${name}.html`), email.html);
      writeFileSync(path.join(dir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`);
      expect(email.html.length).toBeGreaterThan(0);
    }
  });
});
