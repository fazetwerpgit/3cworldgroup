import type { User } from '@/types';

// The signed-in rep's own profile, remembered on this device so a cold open of
// the portal (or the 3C iOS app) paints the shell and the page's skeletons at
// once instead of waiting on Firebase Auth's start-up check plus a Firestore
// read of users/{uid}. It is only a first guess: AuthContext still confirms the
// session and re-reads the profile, and replaces or clears this copy with the
// answer. Only an active account is kept; sign-out and any other outcome clear
// it. It never grants access: every API route verifies the ID token itself.

const KEY = '3c.portal.sessionProfile.v1';
const DATE_FIELDS = ['hireDate', 'createdAt', 'updatedAt', 'lastActiveAt'] as const;

type Stored = { v: 1; user: Record<string, unknown> };

export function readSessionProfile(): User | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Stored;
    const user = parsed?.v === 1 ? parsed.user : null;
    if (!user || typeof user.uid !== 'string' || !user.uid || user.status !== 'active') return null;
    for (const field of DATE_FIELDS) {
      const value = user[field];
      user[field] = typeof value === 'string' ? new Date(value) : undefined;
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
    const stored: Stored = { v: 1, user: JSON.parse(JSON.stringify(user)) as Record<string, unknown> };
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
