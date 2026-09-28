'use client';

import { useEffect } from 'react';

// CSS copied from f566195a globals.css ("Mobile app-shell scroll lock" + .portal-mobile-nav).
const css = `
@media (max-width: 1023px) {
  body[data-portal-bottom-nav] { height: 100dvh; overflow: hidden; overscroll-behavior: none; background: #0b1424; }
  body[data-portal-bottom-nav] .portal-canvas { height: 100dvh; min-height: 0; overflow: hidden; }
  body[data-portal-bottom-nav] .portal-main-offset {
    height: calc(100dvh - 62px - env(safe-area-inset-top, 0px));
    margin-top: calc(62px + env(safe-area-inset-top, 0px));
    overflow-y: auto;
  }
  .portal-mobile-nav {
    position: fixed; z-index: 40; right: 0; bottom: 0; left: 0; display: block;
    height: calc(68px + env(safe-area-inset-bottom));
    padding-bottom: env(safe-area-inset-bottom);
    border-top: 1px solid rgba(229, 238, 246, 0.15);
    background: rgba(3, 9, 22, 0.98);
    transform: translateZ(0);
  }
  .portal-mobile-nav ul { display: grid; height: 68px; grid-template-columns: repeat(5, minmax(0, 1fr)); margin: 0; padding: 0; list-style: none; }
}`;

export function OldShellHarness() {
  useEffect(() => {
    document.body.setAttribute('data-portal-bottom-nav', '');
    return () => document.body.removeAttribute('data-portal-bottom-nav');
  }, []);
  return (
    <div className="portal-canvas">
      <style>{css}</style>
      <main className="portal-main-offset">
        {Array.from({ length: 40 }, (_, i) => (
          <p key={i} style={{ padding: 12 }}>Filler row {i + 1}</p>
        ))}
      </main>
      <nav className="portal-mobile-nav" data-slot="rep-tab-bar">
        <ul>{['Home', 'Sales', 'Log', 'Board', 'Chat'].map((t) => <li key={t}>{t}</li>)}</ul>
      </nav>
    </div>
  );
}
