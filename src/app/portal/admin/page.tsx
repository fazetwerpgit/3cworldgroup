'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
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
        const res = await fetch(`/api/portal/onboarding/review?requestedBy=${user.uid}`);
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
        const res = await fetch(`/api/portal/pipeline?userId=${user.uid}`);
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
        const res = await fetch(`/api/portal/recruiting/invites?userId=${user.uid}`);
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
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <div className="ops-line-ticker">
            <b>ON AIR</b>
            <span>Ops signal / all queues · one board</span>
            <strong>{loading ? 'SYNCING' : 'LIVE'}</strong>
          </div>

          <div className="ops-line-hero">
            <div>
              <p className="ops-line-kicker">01 / The Line / broadcast floor</p>
              <h1><span>Hold</span><br />the line.</h1>
              <p className="ops-line-intro">
                Every review queue on the desk, aggregated client-side from the same endpoints each page already
                calls — no new counts invented, only what the queues themselves report.
              </p>
            </div>
            <div className="ops-line-hero-count">
              <strong className="ops-line-display portal-metallic-num">{loading ? '—' : totalOpen}</strong>
              <small>items waiting</small>
            </div>
          </div>

          <div className="ops-line-strip">
            <div className="ops-line-strip-cell accent">
              <span>Needs you now</span>
              <b>{loading ? '—' : totalOpen}</b>
              <span className="note">
                {loading ? 'loading…' : `${newTodayTotal} new today · oldest ${waitAge(overallOldest)}`}
              </span>
            </div>
            <div className="ops-line-strip-cell">
              <span>Active queues</span>
              <b>{loading ? '—' : activeQueues}</b>
              <span className="note">of {cards.length || 9} total lanes</span>
            </div>
            <div className="ops-line-strip-cell">
              <span>Backed up</span>
              <b>{loading ? '—' : backedCards.length}</b>
              <span className="note">oldest item over 2 days</span>
            </div>
          </div>

          {mostBackedUp.length > 0 && (
            <p className="ops-line-kicker" style={{ marginTop: 13, color: 'var(--ops-line-amber)' }}>
              Most backed up:{' '}
              {mostBackedUp.map((c, i) => (
                <span key={c.key}>
                  {i > 0 && ', '}
                  {c.label} ({waitAge(c.oldestWaitMs)})
                </span>
              ))}
            </p>
          )}

          <div className="ops-line-section-head">
            <div>
              <p className="ops-line-kicker">Queue index / every lane</p>
              <h2>What needs me</h2>
            </div>
            <span className="right">Sorted by urgency</span>
          </div>

          <div className="ops-line-queue-grid">
            {loading && cards.length === 0 ? (
              <div className="ops-line-state-card">Loading queues…</div>
            ) : (
              cards.map((card) => {
                const backed = isBacked(card);
                const pillClass = card.error ? 'error' : backed ? 'backed' : '';
                const pillText = card.error ? 'Error' : backed ? 'Backed up' : 'Clear';
                return (
                  <Link key={card.key} href={card.href} className="ops-line-queue-card">
                    <div className="ops-line-queue-top">
                      <span className="ops-line-queue-name">{card.label}</span>
                      <strong className="ops-line-queue-count portal-metallic-num">{card.error ? '—' : card.count}</strong>
                    </div>
                    <p>{card.error ? 'Failed to load this queue.' : card.description}</p>
                    <div className="ops-line-queue-foot">
                      <span className="ops-line-age">{waitAge(card.oldestWaitMs) === '—' ? 'Open queue' : `Oldest ${waitAge(card.oldestWaitMs)}`}</span>
                      <span className={`ops-line-state${pillClass ? ` ${pillClass}` : ''}`}>{pillText}</span>
                    </div>
                  </Link>
                );
              })
            )}
          </div>

          <div className="ops-line-quiet-rail">
            <span>
              Empty queues stay quiet — only real counts, never a placeholder.
            </span>
            <span>
              {refreshedAt ? (
                <>Last refresh <b>{refreshedAt.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</b></>
              ) : (
                'Loading…'
              )}
            </span>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
