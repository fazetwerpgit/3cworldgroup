'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronRight, RotateCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { AdminFailed, AdminGate, AdminPageHead } from '@/components/portal/admin-d/AdminUi';
import { PEOPLE_HUB, REQUEST_TABS, REQUESTS_HUB, hubTabHref } from '@/components/portal/admin-d/adminHubs';
import { fetchOpenRequests } from '@/components/portal/admin-d/openRequests';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import h from './admin-home.module.css';

interface QueueCard {
  key: string;
  label: string;
  href: string;
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

    const formQueue = async (key: string, label: string): Promise<QueueCard> => {
      const href = hubTabHref(REQUESTS_HUB, key);
      try {
        const form = REQUEST_TABS.find((tab) => tab.key === key)?.form;
        if (!form) throw new Error(`unknown queue ${key}`);
        // Same definition as the owner's Needs-attention count: status == 'new'.
        const open = await fetchOpenRequests(form);
        return {
          key,
          label,
          href,
          count: open.length,
          oldestWaitMs: oldestOf(open.map((r) => r.createdAt)),
          newToday: newTodayOf(open.map((r) => r.createdAt)),
          error: false,
        };
      } catch {
        return { key, label, href, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const onboardingQueue = async (): Promise<QueueCard> => {
      const label = 'Onboarding Review';
      const href = '/portal/admin/onboarding';
      try {
        const res = await authedFetch('/api/portal/onboarding/review');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const rows: { submittedAt?: string | null }[] = Array.isArray(json.submissions) ? json.submissions : [];
        return {
          key: 'onboarding',
          label,
          href,
          count: rows.length,
          oldestWaitMs: oldestOf(rows.map((r) => r.submittedAt)),
          newToday: newTodayOf(rows.map((r) => r.submittedAt)),
          error: false,
        };
      } catch {
        return { key: 'onboarding', label, href, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const pipelineQueue = async (): Promise<QueueCard> => {
      const label = 'Recruiting Pipeline';
      const href = hubTabHref(PEOPLE_HUB, 'pipeline');
      try {
        const res = await authedFetch('/api/portal/pipeline');
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'failed');
        const counts: Record<string, number> = json.counts || {};
        const open = (counts.processing ?? 0) + (counts.need_logins ?? 0) + (counts.cleared_to_sell ?? 0);
        // No per-rep timestamp is fetched here, so age/newToday stay null rather than fabricated.
        return { key: 'pipeline', label, href, count: open, oldestWaitMs: null, newToday: null, error: false };
      } catch {
        return { key: 'pipeline', label, href, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    const recruitingQueue = async (): Promise<QueueCard> => {
      const label = 'Recruiting';
      const href = hubTabHref(PEOPLE_HUB, 'invites');
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
          count: submitted.length,
          oldestWaitMs: oldestOf(submitted.map((r) => r.submittedAt)),
          newToday: newTodayOf(submitted.map((r) => r.submittedAt)),
          error: false,
        };
      } catch {
        return { key: 'recruiting', label, href, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    };

    // Order fixed per the contract: Onboarding, Pipeline, Recruiting, Fiber, Expedite, Payroll, Leads, Manager, Bug.
    const results = await Promise.all([
      onboardingQueue(),
      pipelineQueue(),
      recruitingQueue(),
      formQueue('fiber-reports', 'Fiber Reports'),
      formQueue('expedite-orders', 'Expedite Orders'),
      formQueue('payroll-disputes', 'Payroll Disputes'),
      formQueue('leads-requests', 'Leads Requests'),
      formQueue('manager-interviews', 'Manager Interviews'),
      formQueue('bug-reports', 'Bug Reports'),
    ]);

    setCards(results);
    setLoading(false);
    setRefreshedAt(new Date());
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const loaded = cards.length > 0;
  const failedCount = cards.filter((c) => c.error).length;
  const totalOpen = cards.reduce((sum, c) => sum + c.count, 0);
  const backedCards = useMemo(() => cards.filter(isBacked), [cards]);
  const newTodayTotal = cards.reduce((sum, c) => sum + (c.newToday ?? 0), 0);
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
          meta={
            showStats ? (
              <>
                <b>{totalOpen}</b> waiting
                {newTodayTotal ? ` · ${newTodayTotal} new today` : null}
                {backedCards.length ? ` · ${backedCards.length} over 2 days` : null}
              </>
            ) : loading ? (
              'Loading…'
            ) : null
          }
        />

        <section className={s.panel} aria-labelledby="ops-queues-heading">
          <div className={`${s.panelHead} ${u.band}`}>
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
