import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { revokeAppleSignIn } from '@/lib/auth/appleSignIn';

// Sign in with Apple / Google never creates a portal account: new reps sign up
// with email, password and the team code. When a social sign-in lands on a
// Firebase Auth user that has no users/{uid} profile (Hide My Email, or a
// different Google address than the rep's portal account), Firebase has just
// created a brand-new Auth user. The client signs out and shows a message; this
// removes that orphan Auth user so it never piles up in Firebase Auth.
//
// Deleting is guarded hard so a real account is never touched: no profile, no
// custom claims, exactly one linked provider (Apple or Google, the same one
// this ID token signed in with), and the Auth user was created minutes ago.

export const SOCIAL_PROVIDER_IDS = ['apple.com', 'google.com'] as const;
export type SocialProviderId = (typeof SOCIAL_PROVIDER_IDS)[number];

/** How recent the Auth user's creation must be for it to count as "made by this sign-in". */
export const ORPHAN_MAX_AGE_MS = 10 * 60 * 1000;

export type OrphanCheckInput = {
  /** users/{uid} exists. */
  profileExists: boolean;
  /** The ID token's firebase.sign_in_provider claim. */
  signInProvider: string | undefined;
  /** Provider ids linked to the Auth user (admin getUser().providerData). */
  providerIds: string[];
  /** Admin getUser().metadata.creationTime (UTC string). */
  creationTime: string | undefined;
  /** Admin getUser().customClaims. */
  customClaims: Record<string, unknown> | undefined | null;
  now: number;
};

export type OrphanVerdict =
  | { orphan: true; provider: SocialProviderId }
  | {
      orphan: false;
      reason: 'has_profile' | 'not_social' | 'other_providers' | 'provider_mismatch' | 'has_claims' | 'not_recent';
    };

export function isSocialProvider(id: string | undefined): id is SocialProviderId {
  return (SOCIAL_PROVIDER_IDS as readonly string[]).includes(id ?? '');
}

/** Pure: is this Auth user an orphan the last social sign-in created? Conservative by design. */
export function classifySocialOrphan(input: OrphanCheckInput): OrphanVerdict {
  if (input.profileExists) return { orphan: false, reason: 'has_profile' };
  if (!isSocialProvider(input.signInProvider)) return { orphan: false, reason: 'not_social' };
  if (input.providerIds.length !== 1) return { orphan: false, reason: 'other_providers' };
  if (input.providerIds[0] !== input.signInProvider) return { orphan: false, reason: 'provider_mismatch' };
  if (input.customClaims && Object.keys(input.customClaims).length > 0) return { orphan: false, reason: 'has_claims' };
  const created = input.creationTime ? Date.parse(input.creationTime) : NaN;
  if (!Number.isFinite(created)) return { orphan: false, reason: 'not_recent' };
  const age = input.now - created;
  if (age < -60_000 || age > ORPHAN_MAX_AGE_MS) return { orphan: false, reason: 'not_recent' };
  return { orphan: true, provider: input.signInProvider };
}

export type RejectResult =
  | { status: 'deleted'; provider: SocialProviderId }
  | { status: 'has_profile' }
  | { status: 'kept'; reason: Exclude<OrphanVerdict, { orphan: true }>['reason'] };

/**
 * Re-checks everything from the Admin SDK (never trusts the client), then
 * deletes the orphan: Apple access first (revoke + drop any stored token),
 * then the Auth user. A user with a profile is left alone.
 */
export async function rejectUnlinkedSocialSignIn(
  deps: { auth: Auth; db: Firestore; now?: () => number; revokeApple?: typeof revokeAppleSignIn },
  uid: string,
  signInProvider: string | undefined
): Promise<RejectResult> {
  const profile = await deps.db.doc(`users/${uid}`).get();
  if (profile.exists) return { status: 'has_profile' };
  const authUser = await deps.auth.getUser(uid);
  const verdict = classifySocialOrphan({
    profileExists: false,
    signInProvider,
    providerIds: authUser.providerData.map((info) => info.providerId),
    creationTime: authUser.metadata.creationTime,
    customClaims: authUser.customClaims,
    now: (deps.now ?? Date.now)(),
  });
  if (!verdict.orphan) return { status: 'kept', reason: verdict.reason };
  if (verdict.provider === 'apple.com') await (deps.revokeApple ?? revokeAppleSignIn)(deps.db, uid);
  await deps.auth.deleteUser(uid);
  return { status: 'deleted', provider: verdict.provider };
}
