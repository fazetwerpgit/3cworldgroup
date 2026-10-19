'use client';

import { useLayoutEffect, useState } from 'react';
import { AnnouncementsManager } from '@/components/announcements/AnnouncementsManager';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/admin-d/admin-frame.module.css';
import { installAnnouncementFetchMock } from './fetchMock';

// Design-lab harness (dev only): announcements on mock data. Only the announcements
// API is mocked, and the real fetch is restored when the page unmounts.

export default function Page() {
  const [k] = useState(0);
  // Layout effects run before the manager's passive load effect, so the mock is
  // in place for its first request; the cleanup puts the real fetch back.
  useLayoutEffect(() => installAnnouncementFetchMock(window), []);
  return (
    <div className={s.root} data-shell="rep" key={k}>
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <div className={f.frame}>
            <nav className={f.rail} aria-label="Admin pages" />
            <div className={f.content}>
              <AnnouncementsManager />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
