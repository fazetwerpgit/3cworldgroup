'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { FileText } from 'lucide-react';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  AdminTabs,
  StatusDot,
} from '@/components/portal/admin-d/AdminUi';
import { useOpsQueues } from '@/components/portal/admin-d/opsQueues';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import type { ChatReportView } from '@/app/api/portal/admin/chat-reports/route';
import { REPORT_REASON_LABELS, isReportReason, reportLinkExpired } from '@/lib/chat/moderationShared';
import { openSignedLink } from '@/lib/signedLinks';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './chat-reports.module.css';

// Chat reports (App Store guideline 1.2): messages people reported from the
// chat long-press menu. Remove message soft-deletes it through the chat's own
// DELETE route (the same one a moderator's Delete uses), Dismiss keeps it, and
// either one closes every open report on that message. Open reports list
// oldest first, resolved ones most recently handled first, a page at a time.

type View = 'open' | 'resolved';

function when(isoValue: string | null): string {
  if (!isoValue) return '';
  return new Date(isoValue).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

async function authedFetch(url: string, init?: RequestInit) {
  const token = await auth?.currentUser?.getIdToken();
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers || {}), Authorization: `Bearer ${token ?? ''}`, 'Content-Type': 'application/json' },
  });
}

// The upload link is signed and works for 10 minutes. A tap on it after that
// (or a thumbnail that fails to load, e.g. one scrolled to late) re-signs just
// that report and keeps the rest of the list, "Load more" pages included.
function ReportedMessage({
  report,
  onRefresh,
}: {
  report: ChatReportView;
  onRefresh: () => Promise<ChatReportView | null>;
}) {
  const isImage = report.attachmentUrl && (report.attachmentType === 'image' || report.attachmentType === 'gif');
  // One re-sign per link: a fresh link that still fails is not retried forever.
  const retried = useRef(new Set<string>());
  const openLink = (event: React.MouseEvent<HTMLAnchorElement>) => {
    if (!reportLinkExpired(report.attachmentExpiresAt)) return;
    event.preventDefault();
    void onRefresh().then((fresh) => {
      // If the browser blocks the late open, the row now holds the fresh link
      // and the next tap opens it directly.
      if (fresh?.attachmentUrl) openSignedLink(fresh.attachmentUrl);
    });
  };
  const thumbFailed = () => {
    const url = report.attachmentUrl;
    if (!url || retried.current.has(url) || !report.attachmentExpiresAt) return;
    retried.current.add(url);
    void onRefresh();
  };
  return (
    <blockquote className={r.quote}>
      {report.messageText ? (
        <span>{report.messageText}</span>
      ) : !report.attachmentUrl ? (
        <span className={r.quoteEmpty}>No text</span>
      ) : null}
      {report.attachmentUrl ? (
        isImage ? (
          <a href={report.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Open the reported image" onClick={openLink}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={report.attachmentUrl} alt="" className={r.thumb} loading="lazy" onError={thumbFailed} />
          </a>
        ) : (
          <a href={report.attachmentUrl} target="_blank" rel="noreferrer" className={r.file} onClick={openLink}>
            <FileText size={16} aria-hidden="true" />
            Open the reported file
          </a>
        )
      ) : null}
    </blockquote>
  );
}

function ChatReports() {
  const { user } = useAuth();
  const { cards, refresh: refreshQueues } = useOpsQueues();
  const [view, setView] = useState<View>('open');
  const [rows, setRows] = useState<{ view: View; reports: ChatReportView[]; nextCursor: string | null } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [moreBusy, setMoreBusy] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (which: View, background = false) => {
    if (!background) {
      setLoadError('');
      setMoreError('');
    }
    try {
      const res = await authedFetch(`/api/portal/admin/chat-reports?status=${which}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows({ view: which, reports: json.reports, nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null });
      setLoadError('');
    } catch (err) {
      // A background refresh that fails keeps the list on screen.
      if (!background) setLoadError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  // The next page after the last row shown, appended (rows already on screen
  // are skipped in case one moved between pages).
  const loadMore = async () => {
    if (!rows?.nextCursor) return;
    const { view: which, nextCursor } = rows;
    setMoreBusy(true);
    setMoreError('');
    try {
      const res = await authedFetch(
        `/api/portal/admin/chat-reports?status=${which}&cursor=${encodeURIComponent(nextCursor)}`
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load more');
      const more: ChatReportView[] = Array.isArray(json.reports) ? json.reports : [];
      setRows((prev) => {
        if (!prev || prev.view !== which) return prev;
        const seen = new Set(prev.reports.map((row) => row.id));
        return {
          view: which,
          reports: [...prev.reports, ...more.filter((row) => !seen.has(row.id))],
          nextCursor: typeof json.nextCursor === 'string' ? json.nextCursor : null,
        };
      });
    } catch (err) {
      setMoreError(err instanceof Error ? err.message : 'Failed to load more');
    } finally {
      setMoreBusy(false);
    }
  };

  useEffect(() => {
    if (user) void load(view);
  }, [user, view, load]);
  // Back from the background (throttled): fresh reports and freshly signed links.
  useRefreshOnResume(() => load(view, true), { enabled: !!user });

  // Re-signs one report's links in place (null when it could not be read).
  const refreshReport = useCallback(async (id: string): Promise<ChatReportView | null> => {
    try {
      const res = await authedFetch(`/api/portal/admin/chat-reports?id=${encodeURIComponent(id)}`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.report) return null;
      const fresh = json.report as ChatReportView;
      setRows((prev) =>
        prev ? { ...prev, reports: prev.reports.map((row) => (row.id === id ? { ...row, ...fresh } : row)) } : prev
      );
      return fresh;
    } catch {
      return null;
    }
  }, []);

  const shown = rows?.view === view ? rows.reports : null;
  const hasMore = rows?.view === view && !!rows.nextCursor;
  // With more pages to come the list is not the whole queue: the badge count is.
  const queueCount = cards?.find((card) => card.key === 'chat-reports' && !card.error)?.count;
  const openCount = shown ? (hasMore && queueCount !== undefined ? Math.max(queueCount, shown.length) : shown.length) : null;

  const resolve = async (report: ChatReportView, action: 'removed' | 'dismissed') => {
    setBusyId(report.id);
    setError('');
    try {
      if (action === 'removed') {
        // A message the author or a moderator already deleted is gone either way.
        const del = await authedFetch('/api/portal/chat/messages', {
          method: 'DELETE',
          body: JSON.stringify({ channelId: report.channelId, messageId: report.messageId }),
        });
        if (!del.ok && del.status !== 404) {
          const json = await del.json().catch(() => ({}));
          throw new Error(json.error || 'The message could not be removed');
        }
      }
      const res = await authedFetch('/api/portal/admin/chat-reports', {
        method: 'PATCH',
        body: JSON.stringify({ id: report.id, action }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || 'The report could not be updated');
      const closed = new Set<string>(Array.isArray(json.resolved) ? json.resolved : [report.id]);
      setRows((prev) => (prev ? { ...prev, reports: prev.reports.filter((row) => !closed.has(row.id)) } : prev));
      setConfirmId(null);
      refreshQueues();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className={u.page}>
      <AdminPageHead
        title="Chat reports"
        meta={
          view === 'open' && openCount !== null ? (
            <>
              <b>{hasMore && queueCount === undefined ? `${openCount}+` : openCount}</b> open
            </>
          ) : null
        }
        sub="Messages people reported in Team Chat. Remove takes the message out of the channel for everyone."
      />

      <AdminTabs
        label="Report status"
        value={view}
        options={[
          { value: 'open', label: 'Open' },
          { value: 'resolved', label: 'Resolved' },
        ]}
        onChange={(next) => {
          setConfirmId(null);
          setView(next as View);
        }}
      />

      {error ? (
        <AdminNotice tone="error" onDismiss={() => setError('')}>
          {error}
        </AdminNotice>
      ) : null}

      <section className={s.panel} aria-label={view === 'open' ? 'Open reports' : 'Resolved reports'}>
        {loadError && !shown ? (
          <AdminFailed what="chat reports" detail={loadError} onRetry={() => void load(view)} />
        ) : !shown ? (
          <AdminSkeletonRows rows={3} />
        ) : shown.length === 0 ? (
          <AdminEmpty title={view === 'open' ? 'Nothing reported' : 'No resolved reports yet'}>
            {view === 'open' ? 'Reported chat messages show up here.' : 'Reports you remove or dismiss move here.'}
          </AdminEmpty>
        ) : (
          <ul className={u.rows}>
            {shown.map((report) => {
              const busy = busyId === report.id;
              return (
                <li key={report.id} className={r.item}>
                  <div className={r.top}>
                    <span className={u.tag}>{REPORT_REASON_LABELS[isReportReason(report.reason) ? report.reason : 'other']}</span>
                    {view === 'resolved' ? (
                      <StatusDot tone={report.status === 'removed' ? 'red' : 'muted'}>
                        {report.status === 'removed' ? 'Removed' : 'Dismissed'}
                      </StatusDot>
                    ) : (
                      <span className={r.when}>Reported {when(report.createdAt)}</span>
                    )}
                  </div>

                  <ReportedMessage report={report} onRefresh={() => refreshReport(report.id)} />

                  <dl className={r.facts}>
                    <dt>Posted by</dt>
                    <dd>
                      {report.authorName ?? 'Unknown'}
                      {report.messageCreatedAt ? ` · ${when(report.messageCreatedAt)}` : ''}
                    </dd>
                    <dt>Channel</dt>
                    <dd>{report.channelName ?? report.channelId}</dd>
                    <dt>Reported by</dt>
                    <dd>{report.reporterName ?? 'Unknown'}</dd>
                    {report.details ? (
                      <>
                        <dt>Their note</dt>
                        <dd>{report.details}</dd>
                      </>
                    ) : null}
                    {view === 'resolved' ? (
                      <>
                        <dt>Handled by</dt>
                        <dd>
                          {report.resolvedByName ?? 'Unknown'}
                          {report.resolvedAt ? ` · ${when(report.resolvedAt)}` : ''}
                        </dd>
                      </>
                    ) : null}
                  </dl>

                  <div className={r.actions}>
                    {report.authorId ? (
                      <span className={r.links}>
                        <Link href={`/portal/admin/users/${encodeURIComponent(report.authorId)}`}>View person</Link>
                        <Link href="/portal/admin/onboarding?tab=pipeline">Decommission in Pipeline</Link>
                      </span>
                    ) : (
                      <span />
                    )}
                    {view === 'open' ? (
                      <span className={u.btnRow}>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm}`}
                          disabled={busy}
                          onClick={() => void resolve(report, 'dismissed')}
                        >
                          Dismiss
                        </button>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                          disabled={busy}
                          onClick={() => setConfirmId(report.id)}
                        >
                          Remove message
                        </button>
                      </span>
                    ) : null}
                  </div>

                  {confirmId === report.id ? (
                    <div className={`${u.confirm} ${r.confirm}`} role="alert">
                      <span>Remove this message from {report.channelName ?? 'the channel'} for everyone?</span>
                      <span className={u.btnRow}>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm}`}
                          disabled={busy}
                          onClick={() => setConfirmId(null)}
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                          disabled={busy}
                          onClick={() => void resolve(report, 'removed')}
                        >
                          {busy ? 'Removing' : 'Yes, remove'}
                        </button>
                      </span>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        {shown && hasMore ? (
          <div className={r.more}>
            {moreError ? (
              <p className={r.moreError} role="alert">
                {moreError}
              </p>
            ) : null}
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm}`}
              disabled={moreBusy}
              onClick={() => void loadMore()}
            >
              {moreBusy ? 'Loading' : 'Load more'}
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

export default function ChatReportsPage() {
  return (
    <AdminGate roles={['admin', 'operations']}>
      <ChatReports />
    </AdminGate>
  );
}
