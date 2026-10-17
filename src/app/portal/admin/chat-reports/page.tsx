'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { REPORT_REASON_LABELS, isReportReason } from '@/lib/chat/moderationShared';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import r from './chat-reports.module.css';

// Chat reports (App Store guideline 1.2): messages people reported from the
// chat long-press menu. Remove message soft-deletes it through the chat's own
// DELETE route (the same one a moderator's Delete uses), Dismiss keeps it, and
// either one closes every open report on that message.

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

function ReportedMessage({ report }: { report: ChatReportView }) {
  const isImage = report.attachmentUrl && (report.attachmentType === 'image' || report.attachmentType === 'gif');
  return (
    <blockquote className={r.quote}>
      {report.messageText ? (
        <span>{report.messageText}</span>
      ) : !report.attachmentUrl ? (
        <span className={r.quoteEmpty}>No text</span>
      ) : null}
      {report.attachmentUrl ? (
        isImage ? (
          <a href={report.attachmentUrl} target="_blank" rel="noreferrer" aria-label="Open the reported image">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={report.attachmentUrl} alt="" className={r.thumb} loading="lazy" />
          </a>
        ) : (
          <a href={report.attachmentUrl} target="_blank" rel="noreferrer" className={r.file}>
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
  const { refresh: refreshQueues } = useOpsQueues();
  const [view, setView] = useState<View>('open');
  const [rows, setRows] = useState<{ view: View; reports: ChatReportView[] } | null>(null);
  const [loadError, setLoadError] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = useCallback(async (which: View) => {
    setLoadError('');
    try {
      const res = await authedFetch(`/api/portal/admin/chat-reports?status=${which}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setRows({ view: which, reports: json.reports });
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    if (user) void load(view);
  }, [user, view, load]);

  const shown = rows?.view === view ? rows.reports : null;

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
          view === 'open' && shown ? (
            <>
              <b>{shown.length}</b> open
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

                  <ReportedMessage report={report} />

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
