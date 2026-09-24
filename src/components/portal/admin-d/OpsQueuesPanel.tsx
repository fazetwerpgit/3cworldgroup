'use client';

import Link from 'next/link';
import { ChevronRight, RotateCw } from 'lucide-react';
import { AdminEmpty, AdminFailed } from './AdminUi';
import { ONBOARDING_HUB, PEOPLE_HUB } from './adminHubs';
import { useOpsQueues, type QueueCard } from './opsQueues';
import s from '@/components/portal/rep/rep.module.css';
import u from './admin-ui.module.css';
import h from './ops-queues.module.css';

/** ~2 days: an item waiting longer than this flags its queue as backed up. */
const BACKED_UP_THRESHOLD_MS = 1000 * 60 * 60 * 24 * 2;

function waitAge(ms: number | null): string {
  if (ms === null) return '—';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return '<1h';
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function isBacked(card: QueueCard): boolean {
  return !card.error && card.oldestWaitMs !== null && card.oldestWaitMs > BACKED_UP_THRESHOLD_MS;
}

/** Home's Needs attention is the onboarding work: its three tabs and new signups. */
const HOME_HUBS: string[] = [ONBOARDING_HUB.href, PEOPLE_HUB.href];

/**
 * Home's Needs attention: the onboarding queues the viewer can open (review,
 * invites, pipeline, new signups for admins) with open count, new today and
 * oldest wait, each row linking to its tab. Only rows with something waiting
 * (or that failed to load) show. `extra` rows (the owner's stuck-onboarding
 * check) join them and `onRefresh` reloads them with the queues. The Requests
 * queues are counted on their own nav badge and tabs instead.
 */
export function OpsQueuesPanel({
  title,
  className = '',
  extra = [],
  extraLoading = false,
  onRefresh,
}: {
  title: string;
  className?: string;
  extra?: QueueCard[];
  extraLoading?: boolean;
  onRefresh?: () => void;
}) {
  const queues = useOpsQueues();
  const cards = queues.cards
    ? [...queues.cards.filter((card) => HOME_HUBS.includes(card.hub)), ...extra]
    : null;
  const shown = cards?.filter((card) => card.error || card.count > 0) ?? [];
  const loading = queues.loading || extraLoading;

  const failedCount = cards?.filter((card) => card.error).length ?? 0;
  const allFailed = !!cards && cards.length > 0 && failedCount === cards.length;
  const showStats = !!cards && !allFailed;
  const totalOpen = cards?.reduce((sum, card) => sum + card.count, 0) ?? 0;
  const newToday = cards?.reduce((sum, card) => sum + (card.newToday ?? 0), 0) ?? 0;
  const backed = cards?.filter(isBacked).length ?? 0;
  const updated = queues.refreshedAt
    ? queues.refreshedAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null;
  const refresh = () => {
    queues.refresh();
    onRefresh?.();
  };

  return (
    <section className={`${s.panel} ${className}`} aria-labelledby="ops-queues-heading">
      <div className={`${s.panelHead} ${u.band}`}>
        <h2 id="ops-queues-heading" className={s.kicker}>
          {title}
        </h2>
        <span className={h.headRight}>
          {updated ? <span className={u.panelMeta}>Updated {updated}</span> : null}
          <button type="button" className={s.iconBtn} aria-label="Refresh queues" disabled={loading} onClick={refresh}>
            <RotateCw size={18} className={loading ? u.spin : undefined} aria-hidden="true" />
          </button>
        </span>
      </div>

      {showStats && totalOpen > 0 ? (
        <p className={`${u.meta} ${h.summary}`}>
          <b>{totalOpen}</b> waiting
          {newToday ? ` · ${newToday} new today` : null}
          {backed ? ` · ${backed} over 2 days` : null}
        </p>
      ) : null}

      {failedCount > 0 && !allFailed ? (
        <AdminFailed
          what={failedCount === 1 ? '1 queue' : `${failedCount} queues`}
          detail="totals leave them out"
          onRetry={refresh}
        />
      ) : null}

      {!cards ? (
        <QueueSkeleton />
      ) : allFailed ? (
        <AdminFailed what="the queues" onRetry={refresh} />
      ) : shown.length === 0 ? (
        <AdminEmpty title="Nothing waiting" />
      ) : (
        <ul className={`${u.rows} ${h.cols}`}>
          <li className={u.tHead} aria-hidden="true">
            <span className={u.alignEnd}>Open</span>
            <span>Queue</span>
            <span className={u.alignEnd}>New today</span>
            <span className={u.alignEnd}>Oldest</span>
            <span />
          </li>
          {shown.map((card) => (
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
                <Link href={card.href} className={`${u.row} ${h.queue} ${isBacked(card) ? u.rowWarn : ''}`}>
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
                  <span className={`${u.cell} ${u.alignEnd} ${h.deskCell} ${u.num} ${isBacked(card) ? u.toneAmber : ''}`}>
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
