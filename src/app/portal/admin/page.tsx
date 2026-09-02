'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { PageTitle } from '@/components/portal/PageTitle';
import '@/styles/sweep-admin-a.css';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';

interface QueueCard {
  key: string;
  label: string;
  href: string;
  description: string;
  count: number;
  oldestWaitMs: number | null;
  /** null when the queue has no per-item timestamps to derive "new today" from (e.g. pipeline). */
  newToday: number | null;
  error: boolean;
}

/** ~2 days — an item waiting longer than this flags its queue as backed up. */
const BACKED_UP_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 2;
const ONE_DAY_MS = 1000 * 60 * 60 * 24;

async function authedFetch(url: string) {
  const token = await auth?.currentUser?.getIdToken();
  return fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
}

function waitAge(ms: number | null): string {
  if (ms === null) return '—';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function oldestOf(rows: (string | null | undefined)[]): number | null {
  return rows.reduce<number | null>((acc, iso) => {
    if (!iso) return acc;
    const t = Date.now() - new Date(iso).getTime();
    if (Number.isNaN(t)) return acc;
    return acc === null ? t : Math.max(acc, t);
  }, null);
}

function newTodayOf(rows: (string | null | undefined)[]): number {
  return rows.filter((iso) => {
    if (!iso) return false;
    const t = Date.now() - new Date(iso).getTime();
    return !Number.isNaN(t) && t <= ONE_DAY_MS;
  }).length;
}

function isBacked(card: QueueCard): boolean {
  return !card.error && card.oldestWaitMs !== null && card.oldestWaitMs > BACKED_UP_THRESHOLD_MS;
}

export default function OpsHomePage() {
  const { user } = useAuth();
  const [cards, setCards] = useState<QueueCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    const formQueue = async (key: string, label: string, href: string, path: string, description: string): Promise<QueueCard> => {
      try {
        const res = await authedFetch(`/api/portal/forms/${path}/review`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const rows: { status?: string; createdAt?: string | null }[] = Array.isArray(json.submissions) ? json.submissions : [];
        const open = rows.filter((r) => r.status !== 'handled');
        return {
          key,
          label,
          href,
          description,
          count: open.length,
          oldestWaitMs: oldestOf(open.map((r) => r.createdAt)),
          newToday: newTodayOf(open.map((r) => r.createdAt)),
          error: false,
        };
      } catch {
        return { key, label, href, description, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const onboardingQueue = async (): Promise<QueueCard> => {
      const label = 'Onboarding Review';
      const href = '/portal/admin/onboarding';
      const description = 'New onboarding uploads waiting on manager sign-off.';
      try {
        const res = await authedFetch('/api/portal/onboarding/review');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const rows: { submittedAt?: string | null }[] = Array.isArray(json.submissions) ? json.submissions : [];
        return {
          key: 'onboarding',
          label,
          href,
          description,
          count: rows.length,
          oldestWaitMs: oldestOf(rows.map((r) => r.submittedAt)),
          newToday: newTodayOf(rows.map((r) => r.submittedAt)),
          error: false,
        };
      } catch {
        return { key: 'onboarding', label, href, description, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const pipelineQueue = async (): Promise<QueueCard> => {
      const label = 'Recruiting Pipeline';
      const href = '/portal/admin/pipeline';
      const description = 'Field reps moving through onboarding to active sales.';
      try {
        const res = await authedFetch('/api/portal/pipeline');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const counts: Record<string, number> = json.counts || {};
        const open = (counts.processing ?? 0) + (counts.need_logins ?? 0) + (counts.cleared_to_sell ?? 0);
        // No per-rep timestamp is fetched here, so age/newToday stay null rather than fabricated.
        return { key: 'pipeline', label, href, description, count: open, oldestWaitMs: null, newToday: null, error: false };
      } catch {
        return { key: 'pipeline', label, href, description, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const recruitingQueue = async (): Promise<QueueCard> => {
      const label = 'Recruiting';
      const href = '/portal/admin/recruiting';
      const description = 'Candidate invites that have submitted paperwork.';
      try {
        const res = await authedFetch('/api/portal/recruiting/invites');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const invites: { status?: string; submittedAt?: string | null }[] = Array.isArray(json.invites) ? json.invites : [];
        const submitted = invites.filter((i) => i.status === 'submitted');
        return {
          key: 'recruiting',
          label,
          href,
          description,
          count: submitted.length,
          oldestWaitMs: oldestOf(submitted.map((r) => r.submittedAt)),
          newToday: newTodayOf(submitted.map((r) => r.submittedAt)),
          error: false,
        };
      } catch {
        return { key: 'recruiting', label, href, description, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    // Order fixed per the contract: Onboarding, Pipeline, Recruiting, Fiber, Expedite, Payroll, Leads, Manager, Bug.
    const results = await Promise.all([
      onboardingQueue(),
      pipelineQueue(),
      recruitingQueue(),
      formQueue('fiber-reports', 'Fiber Reports', '/portal/admin/fiber-reports', 'fiber-report', 'Field fiber install reports needing review.'),
      formQueue('expedite-orders', 'Expedite Orders', '/portal/admin/expedite-orders', 'expedite-order', 'Rush order requests waiting on ops approval.'),
      formQueue('payroll-disputes', 'Payroll Disputes', '/portal/admin/payroll-disputes', 'payroll-dispute', 'Contractor payroll disputes needing evidence review.'),
      formQueue('leads-requests', 'Leads Requests', '/portal/admin/leads-requests', 'leads-request', 'Rep lead requests routed to a manager.'),
      formQueue('manager-interviews', 'Manager Interviews', '/portal/admin/manager-interviews', 'manager-interview', 'Candidate interview notes waiting on next steps.'),
      formQueue('bug-reports', 'Bug Reports', '/portal/admin/bug-reports', 'bug-report', 'Portal bugs reported by the field, waiting on triage.'),
    ]);

    setCards(results);
    setLoading(false);
    setRefreshedAt(new Date());
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const totalOpen = cards.reduce((sum, c) => sum + c.count, 0);
  const activeQueues = cards.filter((c) => c.count > 0).length;
  const backedCards = useMemo(() => cards.filter(isBacked), [cards]);
  const newTodayTotal = cards.reduce((sum, c) => sum + (c.newToday ?? 0), 0);
  const overallOldest = cards.reduce<number | null>((acc, c) => {
    if (c.oldestWaitMs === null) return acc;
    return acc === null ? c.oldestWaitMs : Math.max(acc, c.oldestWaitMs);
  }, null);
  const mostBackedUp = [...backedCards].sort((a, b) => {
    const ageDiff = (b.oldestWaitMs ?? 0) - (a.oldestWaitMs ?? 0);
    return ageDiff !== 0 ? ageDiff : b.count - a.count;
  });

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main sweep-admin-page -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <PageTitle title="Ops Home" meta={loading ? 'Loading…' : `${totalOpen} waiting`} />
          <div className="sweep-admin-summary">
            <div><span>Needs attention</span><strong>{loading ? '—' : totalOpen}</strong><small>{loading ? 'Loading queues…' : `${newTodayTotal} added today`}</small></div>
            <div><span>Active queues</span><strong>{loading ? '—' : activeQueues}</strong><small>{cards.length || 9} total</small></div>
            <div><span>Waiting over two days</span><strong>{loading ? '—' : backedCards.length}</strong><small>{overallOldest === null ? 'No wait time yet' : `Oldest ${waitAge(overallOldest)}`}</small></div>
          </div>
          {mostBackedUp.length > 0 && <p className="sweep-admin-note">Longest waits: {mostBackedUp.map((c) => `${c.label} (${waitAge(c.oldestWaitMs)})`).join(', ')}</p>}
          <section aria-labelledby="ops-queues-heading">
            <div className="sweep-admin-section-head"><h2 id="ops-queues-heading">What needs attention</h2><span>{refreshedAt ? `Updated ${refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : 'Loading…'}</span></div>
            {loading && cards.length === 0 ? <div className="ops-line-state-card">Loading queues…</div> : (
              <div className="sweep-admin-queue-list">
                {cards.map((card) => (
                  <Link key={card.key} href={card.href} className="sweep-admin-queue-row">
                    <span className="sweep-admin-queue-count">{card.error ? '—' : card.count}</span>
                    <span className="sweep-admin-queue-copy"><strong>{card.error ? `${card.label} unavailable` : `${card.count} ${card.label.toLowerCase()} waiting`}</strong><small>{card.error ? 'Could not load this queue.' : card.description}</small></span>
                    <span aria-hidden="true" className="sweep-admin-chevron">›</span>
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </ProtectedRoute>
  );
}
