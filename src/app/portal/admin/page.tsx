'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RotateCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { AdminFailed, AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import h from './admin-home.module.css';

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

  const loaded = cards.length > 0;
  const failedCount = cards.filter((c) => c.error).length;
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
  // Every queue failed: there is nothing honest to total.
  const allFailed = loaded && failedCount === cards.length;
  const showStats = loaded && !allFailed;
  const updated = refreshedAt
    ? refreshedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="Ops Home"
          meta={showStats ? <><b>{totalOpen}</b> waiting</> : loading ? 'Loading…' : null}
          sub="Every review queue in one place. Longest waits are flagged."
        />

        <div className={u.stats} aria-busy={loading && !loaded}>
          <div className={u.stat}>
            <span className={s.kicker}>Needs attention</span>
            {showStats ? (
              <strong className={`${u.statValue} ${totalOpen > 0 ? u.statHot : ''}`}>{totalOpen}</strong>
            ) : (
              <StatSkeleton failed={allFailed} />
            )}
            <span className={u.statNote}>{showStats ? `${newTodayTotal} added today` : '\u00a0'}</span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>Active queues</span>
            {showStats ? <strong className={u.statValue}>{activeQueues}</strong> : <StatSkeleton failed={allFailed} />}
            <span className={u.statNote}>{showStats ? `of ${cards.length}` : '\u00a0'}</span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>Over 2 days</span>
            {showStats ? (
              <strong className={`${u.statValue} ${backedCards.length > 0 ? u.statWarn : ''}`}>{backedCards.length}</strong>
            ) : (
              <StatSkeleton failed={allFailed} />
            )}
            <span className={u.statNote}>{showStats ? (backedCards.length ? 'queues backed up' : 'Nothing backed up') : '\u00a0'}</span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>Oldest wait</span>
            {showStats ? (
              <strong className={`${u.statValue} ${overallOldest !== null && overallOldest > BACKED_UP_THRESHOLD_MS ? u.statWarn : ''}`}>
                {waitAge(overallOldest)}
              </strong>
            ) : (
              <StatSkeleton failed={allFailed} />
            )}
            <span className={u.statNote}>
              {showStats ? (mostBackedUp[0] ? mostBackedUp[0].label : overallOldest === null ? 'No wait time yet' : 'Within two days') : '\u00a0'}
            </span>
          </div>
        </div>

        <section className={s.panel} aria-labelledby="ops-queues-heading">
          <div className={s.panelHead}>
            <h2 id="ops-queues-heading" className={s.kicker}>
              What needs attention
            </h2>
            <span className={h.headRight}>
              {updated ? <span className={u.panelMeta}>Updated {updated}</span> : null}
              <button
                type="button"
                className={s.iconBtn}
                aria-label="Refresh queues"
                disabled={loading}
                onClick={() => void load()}
              >
                <RotateCw size={18} className={loading ? u.spin : undefined} aria-hidden="true" />
              </button>
            </span>
          </div>

          {failedCount > 0 && !allFailed ? (
            <AdminFailed
              what={failedCount === 1 ? '1 queue' : `${failedCount} queues`}
              detail="totals leave them out"
              onRetry={() => void load()}
            />
          ) : null}

          {!loaded ? (
            <QueueSkeleton />
          ) : allFailed ? (
            <AdminFailed what="the queues" onRetry={() => void load()} />
          ) : (
            <ul className={`${u.rows} ${h.cols}`}>
              <li className={u.tHead} aria-hidden="true">
                <span className={u.alignEnd}>Open</span>
                <span>Queue</span>
                <span className={u.alignEnd}>New today</span>
                <span className={u.alignEnd}>Oldest</span>
                <span />
              </li>
              {cards.map((card) => (
                <li key={card.key}>
                  {card.error ? (
                    <div className={`${u.row} ${h.queue}`}>
                      <span className={`${h.count} ${h.countNone}`} aria-hidden="true">
                        —
                      </span>
                      <span className={h.queueText}>
                        <strong className={h.queueName}>{card.label}</strong>
                        <span className={h.queueFail}>Couldn&apos;t load this queue</span>
                      </span>
                      <span className={`${u.cell} ${h.deskCell}`} />
                      <span className={`${u.cell} ${h.deskCell}`} />
                      <Link href={card.href} className={h.open} aria-label={`Open ${card.label}`}>
                        <ChevronRight size={20} aria-hidden="true" />
                      </Link>
                    </div>
                  ) : (
                    <Link
                      href={card.href}
                      className={`${u.row} ${h.queue} ${isBacked(card) ? u.rowWarn : ''}`}
                    >
                      <span className={`${h.count} ${card.count > 0 ? h.countHot : h.countNone}`}>{card.count}</span>
                      <span className={h.queueText}>
                        <strong className={h.queueName}>{card.label}</strong>
                        <span className={h.queueDesc}>{card.description}</span>
                        {card.count > 0 ? (
                          <span className={h.queuePhoneMeta}>
                            {[
                              card.newToday ? `${card.newToday} new today` : null,
                              card.oldestWaitMs !== null ? `oldest ${waitAge(card.oldestWaitMs)}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        ) : null}
                      </span>
                      <span className={`${u.cell} ${u.alignEnd} ${h.deskCell} ${u.num}`}>
                        {card.newToday === null ? '—' : card.newToday}
                      </span>
                      <span
                        className={`${u.cell} ${u.alignEnd} ${h.deskCell} ${u.num} ${isBacked(card) ? u.toneAmber : ''}`}
                      >
                        {card.count > 0 ? waitAge(card.oldestWaitMs) : '—'}
                      </span>
                      <ChevronRight size={20} className={u.chev} aria-hidden="true" />
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </AdminGate>
  );
}

function StatSkeleton({ failed }: { failed: boolean }) {
  if (failed) return <strong className={`${u.statValue} ${u.toneMuted}`}>—</strong>;
  return <span className={s.skel} style={{ width: 64, height: 44 }} aria-hidden="true" />;
}

function QueueSkeleton() {
  return (
    <div role="status" aria-label="Loading queues">
      {Array.from({ length: 6 }, (_, index) => (
        <div key={index} className={h.skelRow} aria-hidden="true">
          <span className={s.skel} style={{ width: 34, height: 30 }} />
          <span className={u.skelLines}>
            <span className={s.skel} style={{ width: `${46 - (index % 3) * 8}%`, height: 14 }} />
            <span className={s.skel} style={{ width: `${62 - (index % 2) * 14}%`, height: 12 }} />
          </span>
        </div>
      ))}
    </div>
  );
}
