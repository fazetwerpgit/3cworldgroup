'use client';

import { useState } from 'react';
import { AdminQueue, type QueueRow } from '@/components/portal/admin-ops/AdminQueue';
import s from '@/components/portal/rep/rep.module.css';

// Temporary harness (untracked, never committed): queue reveal + handled row leaving.
const ROWS: QueueRow[] = Array.from({ length: 10 }, (_, i) => ({
  id: `r${i}`,
  status: 'new',
  person: `Rep ${i + 1}`,
  subject: `Dispute ${i + 1}`,
  secondary: 'Sep 22, 2026',
  evidenceKind: 'none',
  detailFields: [{ label: 'Customer', value: 'Alvarez' }],
  searchText: `rep ${i + 1}`,
}));

export default function Page() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState(ROWS);
  return (
    <div className={s.root} data-shell="rep">
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>
          <button id="load" type="button" onClick={() => setLoading(false)}>load</button>
          <AdminQueue
            title="Harness queue"
            columns={['Rep', 'Dispute', 'Filed']}
            rows={rows}
            loading={loading}
            error=""
            onRetry={() => {}}
            onMarkHandled={async (id) => setRows((r) => r.map((x) => (x.id === id ? { ...x, status: 'handled' } : x)))}
            itemNoun="Dispute"
            emptyBody="Nothing waiting."
          />
        </div>
      </main>
    </div>
  );
}
