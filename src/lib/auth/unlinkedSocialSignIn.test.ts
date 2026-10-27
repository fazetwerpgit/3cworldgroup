import { describe, expect, it, vi } from 'vitest';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';

vi.mock('@/lib/auth/appleSignIn', () => ({ revokeAppleSignIn: vi.fn(async () => ({ status: 'none' })) }));

import { classifySocialOrphan, ORPHAN_MAX_AGE_MS, rejectUnlinkedSocialSignIn, type OrphanCheckInput } from './unlinkedSocialSignIn';

const NOW = Date.parse('2026-10-26T18:00:00Z');

function input(over: Partial<OrphanCheckInput> = {}): OrphanCheckInput {
  return {
    profileExists: false,
    signInProvider: 'apple.com',
    providerIds: ['apple.com'],
    creationTime: new Date(NOW - 30_000).toUTCString(),
    customClaims: undefined,
    now: NOW,
    ...over,
  };
}

describe('classifySocialOrphan', () => {
  it('flags a just-created Apple-only user with no profile', () => {
    expect(classifySocialOrphan(input())).toEqual({ orphan: true, provider: 'apple.com' });
  });

  it('flags a just-created Google-only user with no profile', () => {
    expect(classifySocialOrphan(input({ signInProvider: 'google.com', providerIds: ['google.com'] }))).toEqual({
      orphan: true,
      provider: 'google.com',
    });
  });

  it('never flags a user with a profile', () => {
    expect(classifySocialOrphan(input({ profileExists: true }))).toEqual({ orphan: false, reason: 'has_profile' });
  });

  it('never flags a password or custom-token sign-in', () => {
    expect(classifySocialOrphan(input({ signInProvider: 'password', providerIds: ['password'] }))).toMatchObject({
      orphan: false,
      reason: 'not_social',
    });
    expect(classifySocialOrphan(input({ signInProvider: 'custom' }))).toMatchObject({ reason: 'not_social' });
    expect(classifySocialOrphan(input({ signInProvider: undefined }))).toMatchObject({ reason: 'not_social' });
  });

  it('never flags a user with a second linked method (e.g. a password)', () => {
    expect(classifySocialOrphan(input({ providerIds: ['apple.com', 'password'] }))).toMatchObject({
      reason: 'other_providers',
    });
    expect(classifySocialOrphan(input({ providerIds: [] }))).toMatchObject({ reason: 'other_providers' });
  });

  it('never flags when the linked provider differs from the token provider', () => {
    expect(classifySocialOrphan(input({ providerIds: ['google.com'] }))).toMatchObject({ reason: 'provider_mismatch' });
  });

  it('never flags a user with custom claims', () => {
    expect(classifySocialOrphan(input({ customClaims: { role: 'admin' } }))).toMatchObject({ reason: 'has_claims' });
    expect(classifySocialOrphan(input({ customClaims: {} }))).toEqual({ orphan: true, provider: 'apple.com' });
  });

  it('never flags an Auth user older than the window, or with an unknown creation time', () => {
    expect(
      classifySocialOrphan(input({ creationTime: new Date(NOW - ORPHAN_MAX_AGE_MS - 1000).toUTCString() }))
    ).toMatchObject({ reason: 'not_recent' });
    expect(classifySocialOrphan(input({ creationTime: undefined }))).toMatchObject({ reason: 'not_recent' });
    expect(classifySocialOrphan(input({ creationTime: 'garbage' }))).toMatchObject({ reason: 'not_recent' });
    expect(
      classifySocialOrphan(input({ creationTime: new Date(NOW + 10 * 60_000).toUTCString() }))
    ).toMatchObject({ reason: 'not_recent' });
  });
});

function deps(opts: { profileExists?: boolean; providers?: readonly string[]; createdMsAgo?: number; claims?: Record<string, unknown> }) {
  const deleteUser = vi.fn(async () => undefined);
  const getUser = vi.fn(async () => ({
    providerData: (opts.providers ?? ['apple.com']).map((providerId) => ({ providerId })),
    metadata: { creationTime: new Date(NOW - (opts.createdMsAgo ?? 20_000)).toUTCString() },
    customClaims: opts.claims,
  }));
  const get = vi.fn(async () => ({ exists: opts.profileExists ?? false }));
  const revokeApple = vi.fn(async () => ({ status: 'none' as const }));
  return {
    deleteUser,
    getUser,
    revokeApple,
    deps: {
      auth: { getUser, deleteUser } as unknown as Auth,
      db: { doc: vi.fn(() => ({ get })) } as unknown as Firestore,
      now: () => NOW,
      revokeApple,
    },
  };
}

describe('rejectUnlinkedSocialSignIn', () => {
  it('deletes a fresh Apple orphan after revoking Apple access', async () => {
    const d = deps({});
    expect(await rejectUnlinkedSocialSignIn(d.deps, 'u-orphan', 'apple.com')).toEqual({
      status: 'deleted',
      provider: 'apple.com',
    });
    expect(d.revokeApple).toHaveBeenCalledWith(d.deps.db, 'u-orphan');
    expect(d.deleteUser).toHaveBeenCalledWith('u-orphan');
  });

  it('deletes a fresh Google orphan without touching Apple', async () => {
    const d = deps({ providers: ['google.com'] });
    expect(await rejectUnlinkedSocialSignIn(d.deps, 'u-g', 'google.com')).toMatchObject({ status: 'deleted' });
    expect(d.revokeApple).not.toHaveBeenCalled();
    expect(d.deleteUser).toHaveBeenCalledWith('u-g');
  });

  it('passes an existing profile through untouched', async () => {
    const d = deps({ profileExists: true });
    expect(await rejectUnlinkedSocialSignIn(d.deps, 'u-real', 'apple.com')).toEqual({ status: 'has_profile' });
    expect(d.getUser).not.toHaveBeenCalled();
    expect(d.deleteUser).not.toHaveBeenCalled();
  });

  it.each([
    ['a linked password', { providers: ['apple.com', 'password'] }, 'other_providers'],
    ['an old account', { createdMsAgo: ORPHAN_MAX_AGE_MS + 60_000 }, 'not_recent'],
    ['custom claims', { claims: { role: 'owner' } }, 'has_claims'],
  ] as const)('keeps an Auth user with %s', async (_label, opts, reason) => {
    const d = deps(opts);
    expect(await rejectUnlinkedSocialSignIn(d.deps, 'u-keep', 'apple.com')).toEqual({ status: 'kept', reason });
    expect(d.deleteUser).not.toHaveBeenCalled();
    expect(d.revokeApple).not.toHaveBeenCalled();
  });

  it('keeps a password sign-in with no profile', async () => {
    const d = deps({ providers: ['password'] });
    expect(await rejectUnlinkedSocialSignIn(d.deps, 'u-pw', 'password')).toEqual({ status: 'kept', reason: 'not_social' });
    expect(d.deleteUser).not.toHaveBeenCalled();
  });
});
