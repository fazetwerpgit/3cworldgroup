'use client';

import { useEffect } from 'react';

/**
 * The portal is dark-only. The `dark` class lives on the wrapper below (not
 * <html>), so the public marketing site is never affected.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // Mirror the scope onto <body> so Radix overlays (Sheet/Dialog/Dropdown) that
  // portal to document.body — outside the wrapper div below — still pick up the
  // `dark` class and the `.portal-scope` token/focus rules. classList.add/remove
  // (never className=) so we never clobber classes other libraries put on body.
  // Cleanup removes BOTH so unmount (leaving /portal) can't leak dark styles
  // onto the public marketing site.
  useEffect(() => {
    const body = document.body;
    body.classList.add('portal-scope', 'dark');
    return () => {
      body.classList.remove('portal-scope', 'dark');
    };
  }, []);

  return <div className="dark">{children}</div>;
}
