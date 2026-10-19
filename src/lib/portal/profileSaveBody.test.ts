import { describe, expect, it } from 'vitest';
import { profileSaveBody } from './profileSaveBody';

describe('profileSaveBody', () => {
  it('leaves phone out when the remembered profile (no phone) is on screen and only the name changed', () => {
    // Remembered profile: phone missing, so the form shows ''.
    expect(profileSaveBody({ displayName: 'New Name', phone: '', shirtSize: '' }, {})).toEqual({
      displayName: 'New Name',
    });
  });

  it('leaves phone out when it is unchanged', () => {
    expect(
      profileSaveBody({ displayName: 'A', phone: '555-0100', shirtSize: 'L' }, { phone: '555-0100' }),
    ).toEqual({ displayName: 'A', shirtSize: 'L' });
  });

  it('sends a phone the rep typed', () => {
    expect(profileSaveBody({ displayName: 'A', phone: '555-0199', shirtSize: '' }, {})).toEqual({
      displayName: 'A',
      phone: '555-0199',
    });
  });

  it('sends a blank when the rep cleared a phone that was on file', () => {
    expect(profileSaveBody({ displayName: 'A', phone: '', shirtSize: '' }, { phone: '555-0100' })).toEqual({
      displayName: 'A',
      phone: '',
    });
  });
});

describe('Settings page save', () => {
  it('builds its body with profileSaveBody, never sending phone unconditionally', async () => {
    const { readFileSync } = await import('node:fs');
    const { join } = await import('node:path');
    const src = readFileSync(join(process.cwd(), 'src/app/portal/settings/page.tsx'), 'utf8');
    expect(src).toContain('JSON.stringify(profileSaveBody(');
    expect(src).not.toMatch(/JSON\.stringify\(\{\s*displayName,\s*phone\b/);
  });
});
