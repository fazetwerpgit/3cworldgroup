'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye } from 'lucide-react';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { useViewAs } from '@/contexts/ViewAsContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { ViewAsRep } from '@/lib/auth/viewAsHeader';
import { firstNameLastInitial } from '@/lib/sales/orderNumber';
import { RoleDisplayNames, type FieldRole } from '@/types';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import v from './view-as.module.css';

/** "Noah Smith" → "Noah S."; falls back to the email's name. */
export function viewAsName(rep: Pick<ViewAsRep, 'displayName' | 'email'>): string {
  return firstNameLastInitial(rep.displayName) || rep.email.split('@')[0] || 'this rep';
}

type RepList = { status: 'loading' } | { status: 'error' } | { status: 'ready'; reps: ViewAsRep[] };

function SwitchSheet({ current, onPick, onClose }: { current: string; onPick: (rep: ViewAsRep) => void; onClose: () => void }) {
  const [list, setList] = useState<RepList>({ status: 'loading' });
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch('/api/portal/view-as', {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const data = (await response.json().catch(() => null)) as { reps?: ViewAsRep[] } | null;
        if (cancelled) return;
        setList(response.ok && data?.reps ? { status: 'ready', reps: data.reps } : { status: 'error' });
      } catch {
        if (!cancelled) setList({ status: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const shown = useMemo(() => {
    if (list.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return q
      ? list.reps.filter((rep) => `${rep.displayName} ${rep.email}`.toLowerCase().includes(q))
      : list.reps;
  }, [list, query]);

  return (
    <AdminSheet title="View as another rep" description="Read only. Pick whose Home, Sales and Board to see." onClose={onClose}>
      <div className={u.sheetPad}>
        <input
          type="search"
          className={v.search}
          placeholder="Search reps"
          aria-label="Search reps"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {list.status === 'loading' ? (
          <p className={v.note}>Loading reps…</p>
        ) : list.status === 'error' ? (
          <p className={v.note} role="alert">
            Couldn&apos;t load the reps. Close and try again.
          </p>
        ) : shown.length === 0 ? (
          <p className={v.note}>No active rep matches.</p>
        ) : (
          <ul className={v.list}>
            {shown.map((rep) => (
              <li key={rep.uid}>
                <button
                  type="button"
                  className={v.pick}
                  aria-current={rep.uid === current ? 'true' : undefined}
                  onClick={() => onPick(rep)}
                >
                  <span>{rep.displayName || rep.email}</span>
                  <span className={v.pickSub}>{RoleDisplayNames[rep.fieldRole as FieldRole] ?? ''}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AdminSheet>
  );
}

/**
 * The owner's "Viewing as Noah S. · read only" strip, on every portal page
 * while a view session is on: Switch picks another rep, Exit ends it and goes
 * back to People.
 */
export function ViewAsBanner() {
  const router = useRouter();
  const { viewing, rep, start, exit } = useViewAs();
  const [switching, setSwitching] = useState(false);
  if (!viewing || !rep) return null;

  return (
    <>
      <div className={v.bar} role="status" data-slot="view-as-banner">
        <Eye size={18} className={v.eye} aria-hidden="true" />
        <p className={v.text}>
          Viewing as <strong>{viewAsName(rep)}</strong> <span className={v.muted}>· read only</span>
        </p>
        <button type="button" className={v.btn} onClick={() => setSwitching(true)}>
          Switch
        </button>
        <button
          type="button"
          className={`${v.btn} ${v.exit}`}
          onClick={() => {
            exit();
            router.push('/portal/admin/people');
          }}
        >
          Exit
        </button>
      </div>
      {switching ? (
        <SwitchSheet
          current={rep.uid}
          onClose={() => setSwitching(false)}
          onPick={(next) => {
            setSwitching(false);
            start(next);
            router.push('/portal/dashboard');
          }}
        />
      ) : null}
    </>
  );
}
