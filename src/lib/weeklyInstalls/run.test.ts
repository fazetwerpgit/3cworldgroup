import { describe, expect, it } from 'vitest';
import { ONLY_TO_INVALID, weeklyRunConfig } from './run';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('weeklyRunConfig', () => {
  it('is live to every rep only with ENABLED=true and no ONLY_TO', () => {
    expect(weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true' }))).toMatchObject({
      enabled: true,
      onlyTo: null,
      configError: null,
    });
    expect(
      weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: '   ' }))
    ).toMatchObject({ enabled: true, onlyTo: null, configError: null });
  });

  it('redirects every send to a valid ONLY_TO', () => {
    expect(
      weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: ' jmyers@3cworldgroup.com ' }))
    ).toMatchObject({ enabled: true, onlyTo: 'jmyers@3cworldgroup.com', configError: null });
  });

  it('refuses to send (dry run) when ONLY_TO is set but not one valid address', () => {
    for (const value of ['jmyers', 'jmyers@', '@3cworldgroup.com', 'jmyers@3cworldgroup', 'a@b.com,c@d.com', 'a@b.com c@d.com']) {
      expect(
        weeklyRunConfig(env({ WEEKLY_INSTALLS_EMAIL_ENABLED: 'true', WEEKLY_INSTALLS_EMAIL_ONLY_TO: value }))
      ).toMatchObject({ enabled: false, onlyTo: null, configError: ONLY_TO_INVALID });
    }
  });
});
