'use client';

import { useState } from 'react';
import { AnnouncementsManager } from '@/components/announcements/AnnouncementsManager';
import s from '@/components/portal/rep/rep.module.css';
import f from '@/components/portal/admin-d/admin-frame.module.css';

// Temporary harness (untracked, never committed): announcements on mock data. No network.
const LIST = {
  nextSendDate: '2026-09-24',
  announcements: [
    { id: '1', title: 'New: log a sale from a screenshot', body: 'Snap the order confirmation and the form fills itself. Check the details, then submit.', sendAt: '2026-09-24T13:00:00Z', status: 'scheduled', createdBy: 'o', createdAt: '2026-09-23T20:00:00Z', sentAt: null, sentCount: 0, failedCount: 0 },
    { id: '2', title: 'Leaderboard reset', body: 'Monthly board starts over today.', sendAt: '2026-09-01T13:00:00Z', status: 'sent', createdBy: 'o', createdAt: '2026-08-31T20:00:00Z', sentAt: '2026-09-01T13:04:00Z', sentCount: 47, failedCount: 3 },
    { id: '3', title: 'Team call moved', body: 'Friday call is at 10 AM this week.', sendAt: '2026-08-20T13:00:00Z', status: 'cancelled', createdBy: 'o', createdAt: '2026-08-19T20:00:00Z', sentAt: null, sentCount: 0, failedCount: 0 },
  ],
};

if (typeof window !== 'undefined') {
  window.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    const json = url.endsWith('/recipients') ? { count: 47 } : url.endsWith('/send-now') ? { id: 'x', sentCount: 46, failedCount: 1 } : url.endsWith('/test') ? { devices: 2, delivered: 2 } : url.includes('/announcements') ? LIST : {};
    return new Response(JSON.stringify(json), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
}

export default function Page() {
  const [k] = useState(0);
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
