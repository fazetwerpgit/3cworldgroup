import type { ViewAsRep } from '@/lib/auth/viewAsHeader';

// The rep the owner is viewing as, kept in sessionStorage: it survives a
// reload of the tab and dies with it, and sign-out clears it (AuthContext).
export const VIEW_AS_STORAGE_KEY = '3c.viewAs';

export function readViewAs(): ViewAsRep | null {
  try {
    const raw = window.sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ViewAsRep> | null;
    if (!parsed || typeof parsed.uid !== 'string' || !parsed.uid) return null;
    return {
      uid: parsed.uid,
      displayName: typeof parsed.displayName === 'string' ? parsed.displayName : '',
      email: typeof parsed.email === 'string' ? parsed.email : '',
      fieldRole: typeof parsed.fieldRole === 'string' ? parsed.fieldRole : '',
      avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
    };
  } catch {
    return null;
  }
}

export function writeViewAs(rep: ViewAsRep) {
  try {
    window.sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(rep));
  } catch {
    // Storage blocked: the view lasts until the page reloads.
  }
}

export function clearViewAs() {
  try {
    window.sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
  } catch {
    // Storage blocked: nothing was stored.
  }
}
