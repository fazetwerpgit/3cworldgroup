import { isOwner, type FieldRole, type PlatformRole } from '@/types';

// Who Ask 3C is open to. One env var, ASK_3C_ENABLED, serves the routes and
// the client: next.config.ts inlines it into the client bundle at build time
// (same as SALE_SCAN_ENABLED).
//   'true'    every active user
//   'owners'  only users with the platform owner role (a quiet rollout)
//   anything else: off
// Functions, not constants, so tests can stub the env.

export type AskAudience = 'all' | 'owners' | 'off';

export function askAudience(): AskAudience {
  const value = process.env.ASK_3C_ENABLED;
  return value === 'true' ? 'all' : value === 'owners' ? 'owners' : 'off';
}

/** Whether a user with this platform role may use Ask 3C right now. */
export function askOpenTo(role: PlatformRole | FieldRole | null | undefined): boolean {
  const audience = askAudience();
  return audience === 'all' || (audience === 'owners' && isOwner(role ?? undefined));
}
