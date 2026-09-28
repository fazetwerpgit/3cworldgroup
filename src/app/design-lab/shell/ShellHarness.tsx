'use client';

import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { REP_TABS } from '@/components/portal/rep/repNav';
import s from '@/components/portal/rep/rep.module.css';

// Same DOM + classes as RepChrome/RepTopBar/RepTabBar, minus auth/data hooks.
export function ShellHarness() {
  return (
    <div className={s.root} data-shell="rep">
      <header className={s.topbar} data-probe="topbar">
        <div className={s.topbarInner}>Harness</div>
      </header>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          {Array.from({ length: 40 }, (_, i) => (
            <p key={i} style={{ padding: 12 }}>Filler row {i + 1}</p>
          ))}
        </div>
      </main>
      <BodyLayer>
        <nav className={s.tabbar} aria-label="Primary" data-slot="rep-tab-bar">
          <ul className={s.tabs}>
            {REP_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <li key={tab.href}>
                  <a href="#" className={s.tab}>
                    {tab.log ? (
                      <span className={s.tabLog}><Icon size={20} /></span>
                    ) : (
                      <span className={s.tabIcon}><Icon size={22} /></span>
                    )}
                    {tab.short}
                  </a>
                </li>
              );
            })}
          </ul>
        </nav>
      </BodyLayer>
    </div>
  );
}
