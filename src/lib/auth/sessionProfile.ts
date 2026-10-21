import type { User } from '@/types';

// The signed-in rep's own profile, remembered on this device so a cold open of
// the portal (or the 3C iOS app) paints the shell and the page's skeletons at
// once instead of waiting on Firebase Auth's start-up check plus a Firestore
// read of users/{uid}. It is only a first guess: AuthContext still confirms the
// session and re-reads the profile, and replaces or clears this copy with the
// answer. Only an active account is kept; sign-out and any other outcome clear
// it. It never grants access: every API route verifies the ID token itself.

const KEY = '3c.portal.sessionProfile.v1';

// Only what the shell and role gates need to paint. Personal details (address,
// phone, city/state/zip, shirt size, hire date) never touch device storage;
// they arrive with the real profile read a moment later.
const PERSISTED_FIELDS = [
  'uid',
  'email',
  'displayName',
  'role',
  'fieldRole',
  // Solar is a second role axis: without it a solar rep's cold open paints
  // the shell with no Solar nav until the profile read lands.
  'solarRole',
  // A dual rep's Sales opens on it; without it a cold open paints Fiber first.
  'mainLine',
  'isIBO',
  'status',
  'avatarUrl',
  'pushRequired',
  'territoryId',
  'reportsToId',
] as const;

type Stored = { v: 1; user: Record<string, unknown> };

function pick(source: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const field of PERSISTED_FIELDS) {
    if (source[field] !== undefined && source[field] !== null) out[field] = source[field];
  }
  return out;
}

export function readSessionProfile(): User | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const stored = parsed?.v === 1 ? parsed.user : null;
    if (!stored || typeof stored !== 'object') return null;
    if (typeof stored.uid !== 'string' || !stored.uid || stored.status !== 'active') return null;
    // An entry written before the allowlist holds the full profile: strip it
    // and rewrite the trimmed copy so the extra fields leave storage too.
    const user = pick(stored);
    if (Object.keys(stored).some((key) => !(key in user))) {
      window.localStorage.setItem(KEY, JSON.stringify({ v: 1, user } satisfies Stored));
    }
    return user as unknown as User;
  } catch {
    return null;
  }
}

export function writeSessionProfile(user: User): void {
  if (user.status !== 'active') {
    clearSessionProfile();
    return;
  }
  try {
    const stored: Stored = { v: 1, user: pick(user as unknown as Record<string, unknown>) };
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked or full: the next open just waits for the profile read.
  }
}

export function clearSessionProfile(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}
