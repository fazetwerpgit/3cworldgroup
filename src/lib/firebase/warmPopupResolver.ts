'use client';

import { browserPopupRedirectResolver } from 'firebase/auth';
import { auth } from '@/lib/firebase/config';
import { isNativeApp } from '@/lib/app/isNativeApp';

// Auth is created without a popup resolver (config.ts), so Firebase no longer
// loads Google's sign-in iframe at startup. signInWithPopup / linkWithPopup
// then load it on the tap, BEFORE window.open, and on iPhone/Safari that
// network wait can outlast the tap's user activation, so the popup is blocked
// (auth/popup-blocked). Screens that offer a Google popup call this on mount:
// it starts that same load early (the resolver singleton the popup calls use,
// so the tap finds it ready). Best-effort: a failure only loses the head start.
export function warmPopupResolver(): void {
  // The app signs in natively: no popup there, so nothing to warm.
  if (typeof window === 'undefined' || !auth || isNativeApp()) return;
  const target = auth;
  void import('@firebase/auth/internal')
    .then(({ _getInstance }) => {
      const resolver = _getInstance<{ _initialize: (a: unknown) => Promise<unknown> }>(browserPopupRedirectResolver);
      return resolver._initialize(target);
    })
    .catch(() => undefined);
}
