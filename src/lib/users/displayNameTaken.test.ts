import { describe, expect, it } from 'vitest';
import { displayNameKey, isDisplayNameTaken } from './displayNameTaken';

type UserDoc = Record<string, unknown>;

function db(users: Record<string, string | UserDoc>) {
  const selected: string[][] = [];
  return {
    selected,
    collection: () => ({
      select: (...fields: string[]) => {
        selected.push(fields);
        return {
          get: async () => ({
            docs: Object.entries(users).map(([id, value]) => {
              const data: UserDoc = typeof value === 'string' ? { displayName: value, status: 'active' } : value;
              return { id, get: (field: string) => data[field] };
            }),
          }),
        };
      },
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

  it('counts pending accounts, which are real people waiting for approval', async () => {
    const users = db({ u1: { displayName: 'Jane Doe', status: 'pending' } });
    await expect(isDisplayNameTaken(users, 'Jane Doe', 'u9')).resolves.toBe(true);
  });

  it.each([
    ['a suspected bot', { suspectedBot: true }],
    ['a deactivated account', { status: 'inactive' }],
    ['a self-deleted account', { selfDeleted: true }],
    ['a deleted account', { deletedAt: new Date() }],
    ['a demo account', { demoAccount: true }],
  ])('ignores %s', async (_label, extra) => {
    const users = db({ u1: { displayName: 'Jane Doe', status: 'active', ...extra } });
    await expect(isDisplayNameTaken(users, 'Jane Doe', 'u9')).resolves.toBe(false);
  });

  it('never blocks the anonymized "Deleted user" name', async () => {
    const users = db({ u1: { displayName: 'Deleted user', status: 'active' } });
    await expect(isDisplayNameTaken(users, 'deleted user', 'u9')).resolves.toBe(false);
  });

  it('reads only the fields the check needs', async () => {
    const users = db({ u1: 'Jane Doe' });
    await isDisplayNameTaken(users, 'Jane Doe', 'u9');
    expect(users.selected[0]).toEqual(
      expect.arrayContaining(['displayName', 'status', 'suspectedBot', 'selfDeleted', 'deletedAt', 'demoAccount'])
    );
  });
});
