import { isOwner, type FieldRole, type PlatformRole } from '@/types';

// Who Ask 3C is open to. One env var, ASK_3C_ENABLED, serves the routes and
// the client: next.config.ts inlines it into the client bundle at build time
// (same as SALE_SCAN_ENABLED).
//   'true'    every active user
//   'owners'  only users with the platform owner role (a quiet rollout)
//   anything else: off
// ASK_3C_ALSO: comma-separated user ids who also get it while it's 'owners'
// (reps trying it early). Inlined the same way.
// Functions, not constants, so tests can stub the env.

export type AskAudience = 'all' | 'owners' | 'off';

export function askAudience(): AskAudience {
  const value = process.env.ASK_3C_ENABLED;
  return value === 'true' ? 'all' : value === 'owners' ? 'owners' : 'off';
}

/** Users let in early while the audience is 'owners'. */
export function askEarlyUids(): string[] {
  return (process.env.ASK_3C_ALSO ?? '').split(',').map((uid) => uid.trim()).filter(Boolean);
}

/** Whether this user may use Ask 3C right now. */
export function askOpenTo(
  role: PlatformRole | FieldRole | null | undefined,
  uid?: string | null
): boolean {
  const audience = askAudience();
  if (audience === 'all') return true;
  if (audience !== 'owners') return false;
  return isOwner(role ?? undefined) || (!!uid && askEarlyUids().includes(uid));
}
