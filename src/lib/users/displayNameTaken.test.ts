import { describe, expect, it } from 'vitest';
import { displayNameKey, isDisplayNameTaken } from './displayNameTaken';

function db(users: Record<string, unknown>) {
  return {
    collection: () => ({
      select: () => ({
        get: async () => ({
          docs: Object.entries(users).map(([id, displayName]) => ({ id, get: () => displayName })),
        }),
      }),
    }),
  };
}

describe('display name copies', () => {
  it('compares names ignoring case and spacing only', () => {
    expect(displayNameKey('  Jane   DOE ')).toBe('jane doe');
    expect(displayNameKey(undefined)).toBe('');
  });

  it('finds another user with the exact name, never the caller themself', async () => {
    const users = db({ u1: 'Jane Doe', u2: 'Jane D.' });
    await expect(isDisplayNameTaken(users, 'jane  doe', 'u9')).resolves.toBe(true);
    await expect(isDisplayNameTaken(users, 'Jane Doe', 'u1')).resolves.toBe(false);
    await expect(isDisplayNameTaken(users, 'Jane', 'u9')).resolves.toBe(false);
    await expect(isDisplayNameTaken(users, '   ', 'u9')).resolves.toBe(false);
  });
});
