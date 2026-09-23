'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, ChevronDown, ClipboardCheck, FileText, Lock, RotateCw } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import {
  AdminAvatar,
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
} from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import o from './admin-onboarding.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { isEsignItem } from '@/lib/onboarding/esign';
import { OnboardingCategory, OnboardingCategoryLabels } from '@/types';

// The review route verifies the reviewer from the ID token and stamps their uid
// and name onto the submission — the rep sees that name, so it must not be
// client-supplied. userId in the body is the TARGET rep being reviewed.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

interface Submission {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  /** Sensitive item whose files this caller (operations) may not open. */
  adminOnly?: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
  userName: string;
  userEmail: string;
  atRisk: boolean;
  submittedAt: string | null;
  label: string;
  status: 'submitted' | 'approved' | 'rejected' | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  hasSignedPdf: boolean;
  esignEnvelopeId?: string | null;
}

interface SubmissionGroup {
  userId: string;
  userName: string;
  items: Submission[];
  atRisk: boolean;
}

/** Display-only fallback for submissions missing a resolved userName — never touches
    the write path. The API falls back to the uid itself when no displayName exists,
    so "name equals uid" also counts as unnamed. */
function hasRealName(userName: string, userId: string): boolean {
  return Boolean(userName) && userName !== userId;
}

function repLabel(userName: string, userId: string): string {
  return hasRealName(userName, userId) ? userName : `Unnamed rep · ${userId.slice(-6)}`;
}

function repKey(userName: string, userId: string): string {
  return hasRealName(userName, userId) ? userName : userId;
}

function groupSubmissions(items: Submission[]): SubmissionGroup[] {
  const groups = new Map<string, SubmissionGroup>();
  items.forEach((submission) => {
    const existing = groups.get(submission.userId);
    if (existing) {
      existing.items.push(submission);
      existing.atRisk ||= submission.atRisk;
      return;
    }
    groups.set(submission.userId, {
      userId: submission.userId,
      userName: submission.userName,
      items: [submission],
      atRisk: submission.atRisk,
    });
  });
  return Array.from(groups.values());
}

function waitLabel(submittedAt: string | null): string {
  if (!submittedAt) return 'unknown wait';
  const ms = Date.now() - new Date(submittedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'unknown wait';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours || 1} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function groupSize(count: number) {
  return `${count} item${count === 1 ? '' : 's'}`;
}

/** One rep's block inside a section: who, at-risk flag, item count, then their rows. */
function RepGroup({ group, children }: { group: SubmissionGroup; children: ReactNode }) {
  const name = repLabel(group.userName, group.userId);
  return (
    <li className={o.group}>
      <div className={o.groupHead}>
        <span className={u.person}>
          <AdminAvatar name={name} />
          <span className={u.personText}>
            <span className={u.personName}>
              <span>{name}</span>
              {group.atRisk ? (
                <span className={`${u.tag} ${u.tagAmber}`}>
                  <AlertTriangle size={12} aria-hidden="true" />
                  At risk
                </span>
              ) : null}
            </span>
            <span className={u.personSub}>{groupSize(group.items.length)}</span>
          </span>
        </span>
      </div>
      <ul className={`${u.rows} ${o.cols}`}>{children}</ul>
    </li>
  );
}

/** Section panel: kicker title, live count, one-line explanation. */
function Section({
  id,
  title,
  count,
  sub,
  action,
  children,
}: {
  id: string;
  title: string;
  count?: ReactNode;
  sub?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={s.panel} aria-labelledby={id}>
      <div className={s.panelHead}>
        <h2 id={id} className={s.kicker}>
          {title}
        </h2>
        <span className={o.headRight}>
          {count !== undefined ? <span className={u.panelMeta}>{count}</span> : null}
          {action}
        </span>
      </div>
      {sub ? <p className={o.sectionSub}>{sub}</p> : null}
      {children}
    </section>
  );
}

function evidenceLabel(submission: Submission) {
  if (submission.adminOnly) return 'Admin only';
  if (submission.referenceKind === 'storage') {
    return `${submission.files.length} file${submission.files.length === 1 ? '' : 's'}`;
  }
  return 'Reference';
}

export default function OnboardingReviewPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [esignPending, setEsignPending] = useState<Submission[]>([]);
  const [completed, setCompleted] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  // Reject failures show inside the sheet; the page banner sits behind it.
  const [rejectError, setRejectError] = useState('');
  const [notice, setNotice] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState('all');
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [sendState, setSendState] = useState<Record<string, { message: string; error?: boolean }>>({});

  // `background` refreshes after an action keep the current list on failure,
  // so a confirmation the admin just got is not swapped for a load error.
  const fetchQueue = useCallback(async (background = false) => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/onboarding/review', {
        headers: await authHeaders(),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load review queue');
      setSubmissions(Array.isArray(json.submissions) ? json.submissions : []);
      setEsignPending(Array.isArray(json.esignPending) ? json.esignPending : []);
      setCompleted(Array.isArray(json.completed) ? json.completed : []);
      setLoadFailed(false);
    } catch {
      if (background) {
        setError("Couldn't refresh the queue. Tap refresh to try again.");
      } else {
        // A failed load says so (with a retry) instead of showing an empty queue.
        setLoadFailed(true);
      }
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void fetchQueue(); }, [fetchQueue]);

  const retryLoad = () => {
    setLoading(true);
    setError('');
    void fetchQueue();
  };

  const openReject = (submission: Submission) => {
    setRejectError('');
    setRejectModal(submission);
  };

  const closeReject = () => {
    setRejectModal(null);
    setRejectionReason('');
    setRejectError('');
  };

  // The signed-pdf route verifies a Bearer token, which a plain link cannot
  // send, so fetch the PDF with the token and open it as a blob URL. The tab is
  // opened synchronously in the click so popup blockers allow it.
  const openSignedPdf = async (submission: Submission) => {
    const tab = window.open('', '_blank');
    try {
      const response = await fetch(
        `/api/portal/onboarding/signed-pdf?userId=${encodeURIComponent(submission.userId)}&itemId=${encodeURIComponent(submission.itemId)}`,
        { headers: await authHeaders() }
      );
      if (!response.ok) {
        const json = await response.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to open signed PDF');
      }
      const url = URL.createObjectURL(await response.blob());
      if (tab) tab.location.href = url;
      else window.open(url, '_blank');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      tab?.close();
      setError(err instanceof Error ? err.message : 'Failed to open signed PDF');
    }
  };

  const review = async (submission: Submission, status: 'approved' | 'rejected', reason?: string) => {
    if (!user) return;
    setProcessingId(submission.id);
    const fail = status === 'rejected' ? setRejectError : setError;
    fail('');
    try {
      const response = await fetch('/api/portal/onboarding/review', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          userId: submission.userId,
          itemId: submission.itemId,
          status,
          rejectionReason: reason,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to review submission');
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      setEsignPending((prev) => prev.filter((s) => s.id !== submission.id));
      closeReject();
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to review submission');
    } finally {
      setProcessingId(null);
    }
  };

  const sendForSignature = async (submission: Submission) => {
    if (!user) return;
    setProcessingId(submission.id);
    setSendState((prev) => ({ ...prev, [submission.id]: { message: '' } }));
    try {
      const response = await fetch('/api/portal/onboarding/esign-send', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: submission.userId, itemId: submission.itemId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to send for signature');
      // The row moves to "Out for signature" on refresh, so confirm at page level.
      setSendState((prev) => {
        const next = { ...prev };
        delete next[submission.id];
        return next;
      });
      setNotice(
        json.reason === 'envelope_exists'
          ? `${submission.itemLabel} was already sent to ${repLabel(submission.userName, submission.userId)}.`
          : `Sent ${submission.itemLabel} to ${repLabel(submission.userName, submission.userId)}. They can sign it in their portal.`
      );
      await fetchQueue(true);
    } catch (err) {
      setSendState((prev) => ({
        ...prev,
        [submission.id]: { message: err instanceof Error ? err.message : 'Failed to send for signature', error: true },
      }));
    } finally {
      setProcessingId(null);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  };

  const people = useMemo(() => {
    const seen = new Map<string, string>();
    [...submissions, ...esignPending, ...completed].forEach((s) => {
      const key = repKey(s.userName, s.userId);
      if (!seen.has(key)) seen.set(key, repLabel(s.userName, s.userId));
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [submissions, esignPending, completed]);
  const filtered = useMemo(
    () =>
      submissions.filter(
        (s) =>
          (personFilter === 'all' || repKey(s.userName, s.userId) === personFilter) &&
          (!atRiskOnly || s.atRisk)
      ),
    [submissions, personFilter, atRiskOnly]
  );
  const filteredEsignPending = useMemo(
    () =>
      esignPending.filter(
        (s) =>
          (personFilter === 'all' || repKey(s.userName, s.userId) === personFilter) &&
          (!atRiskOnly || s.atRisk)
      ),
    [esignPending, personFilter, atRiskOnly]
  );
  const filteredCompleted = useMemo(
    () =>
      completed.filter(
        (s) =>
          (personFilter === 'all' || repKey(s.userName, s.userId) === personFilter) &&
          (!atRiskOnly || s.atRisk)
      ),
    [completed, personFilter, atRiskOnly]
  );

  const waitingPeople = new Set(submissions.map((item) => item.userId)).size;
  const atRiskPeople = new Set(
    [...submissions, ...esignPending].filter((item) => item.atRisk).map((item) => item.userId),
  ).size;
  const showStats = !loading && !loadFailed;
  const catLabel = (submission: Submission) => OnboardingCategoryLabels[submission.category] ?? submission.category;

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="Onboarding Review"
          meta={
            showStats ? (
              <>
                <b>{submissions.length}</b> waiting
              </>
            ) : null
          }
          sub="Review submitted documents and send clear next steps."
        />

        <div className={u.stats} aria-busy={loading}>
          <div className={u.stat}>
            <span className={s.kicker}>Waiting</span>
            {showStats ? (
              <strong className={`${u.statValue} ${submissions.length ? u.statHot : ''}`}>{submissions.length}</strong>
            ) : (
              <StatPlaceholder failed={loadFailed} />
            )}
            <span className={u.statNote}>
              {showStats ? `from ${waitingPeople} ${waitingPeople === 1 ? 'person' : 'people'}` : '\u00a0'}
            </span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>At risk</span>
            {showStats ? (
              <strong className={`${u.statValue} ${atRiskPeople ? u.statWarn : ''}`}>{atRiskPeople}</strong>
            ) : (
              <StatPlaceholder failed={loadFailed} />
            )}
            <span className={u.statNote}>
              {showStats ? (atRiskPeople ? 'people behind' : 'Nobody behind') : '\u00a0'}
            </span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>Out for signature</span>
            {showStats ? (
              <strong className={u.statValue}>{esignPending.length}</strong>
            ) : (
              <StatPlaceholder failed={loadFailed} />
            )}
            <span className={u.statNote}>{showStats ? 'with the rep' : '\u00a0'}</span>
          </div>
          <div className={u.stat}>
            <span className={s.kicker}>Completed</span>
            {showStats ? (
              <strong className={u.statValue}>{completed.length}</strong>
            ) : (
              <StatPlaceholder failed={loadFailed} />
            )}
            <span className={u.statNote}>{showStats ? 'approved or rejected' : '\u00a0'}</span>
          </div>
        </div>

        <ActionQueue />

        <div className={u.toolbar}>
          <div className={u.chips} role="group" aria-label="Person filter">
            <button
              type="button"
              className={u.chip}
              aria-pressed={personFilter === 'all'}
              onClick={() => setPersonFilter('all')}
            >
              All People
            </button>
            {people.map((p) => (
              <button
                key={p.key}
                type="button"
                className={u.chip}
                aria-pressed={personFilter === p.key}
                onClick={() => setPersonFilter(p.key)}
              >
                {p.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={`${u.chip} ${o.riskChip}`}
            aria-pressed={atRiskOnly}
            onClick={() => setAtRiskOnly((v) => !v)}
          >
            <AlertTriangle size={16} aria-hidden="true" />
            At-risk Only
          </button>
        </div>

        {error ? (
          <AdminNotice tone="error" onDismiss={() => setError('')}>
            {error}
          </AdminNotice>
        ) : null}
        {notice ? (
          <AdminNotice tone="ok" onDismiss={() => setNotice('')}>
            {notice}
          </AdminNotice>
        ) : null}

        <Section
          id="onb-waiting"
          title="Waiting for review"
          action={
            <button
              type="button"
              className={s.iconBtn}
              onClick={retryLoad}
              disabled={loading}
              aria-label="Refresh review queue"
            >
              <RotateCw size={18} className={loading ? u.spin : undefined} aria-hidden="true" />
            </button>
          }
          count={showStats ? `${filtered.length} of ${submissions.length}` : undefined}
        >
          {loading ? (
            <AdminSkeletonRows rows={3} label="Loading submissions" />
          ) : loadFailed ? (
            <AdminFailed what="the review queue" onRetry={retryLoad} />
          ) : filtered.length === 0 ? (
            submissions.length === 0 ? (
              <AdminEmpty icon={<ClipboardCheck size={28} aria-hidden="true" />} title="Review queue is clear">
                No onboarding submissions need review right now.
              </AdminEmpty>
            ) : (
              <AdminEmpty title="No submissions match this view">Clear filters to see all submissions.</AdminEmpty>
            )
          ) : (
            <>
              <div className={`${u.tHead} ${o.cols}`} aria-hidden="true">
                <span>Item</span>
                <span>Waiting</span>
                <span>Access</span>
                <span>Evidence</span>
                <span />
              </div>
              <ul className={o.groups}>
                {groupSubmissions(filtered).map((group) => (
                  <RepGroup key={group.userId} group={group}>
                    {group.items.map((submission) => {
                      const expanded = expandedId === submission.id;
                      const working = processingId === submission.id;
                      return (
                        <li key={submission.id} className={submission.atRisk ? u.rowWarn : undefined}>
                          <button
                            type="button"
                            className={`${u.row} ${o.itemRow}`}
                            onClick={() => setExpandedId(expanded ? null : submission.id)}
                            aria-expanded={expanded}
                          >
                            <span className={u.cellMain}>
                              <strong className={o.itemName}>{submission.itemLabel}</strong>
                              <span className={u.cellSub}>{catLabel(submission)}</span>
                            </span>
                            <span className={`${u.cell} ${u.num}`} data-label="Waiting">
                              {waitLabel(submission.submittedAt)}
                            </span>
                            <span className={u.cell} data-label="Access">
                              <span className={o.access}>
                                {submission.sensitive ? <Lock size={14} aria-hidden="true" /> : null}
                                {submission.sensitive ? 'Sensitive' : 'Standard'}
                              </span>
                            </span>
                            <span className={u.cell} data-label="Evidence">
                              <span className={`${u.tag} ${submission.adminOnly ? u.tagAmber : ''}`}>
                                {submission.adminOnly ? <Lock size={12} aria-hidden="true" /> : null}
                                {evidenceLabel(submission)}
                              </span>
                            </span>
                            <span className={u.cellEnd}>
                              <ChevronDown
                                size={20}
                                className={`${u.chev} ${expanded ? o.chevOpen : ''}`}
                                aria-hidden="true"
                              />
                            </span>
                          </button>

                          {expanded ? (
                            <div className={o.detail}>
                              <div className={o.reference}>
                                <p className={s.kicker}>Reference</p>
                                {submission.referenceKind === 'storage' && submission.adminOnly ? (
                                  <p className={o.locked}>
                                    <Lock size={16} aria-hidden="true" />
                                    Admin only. Sensitive files are visible to admins.
                                  </p>
                                ) : submission.referenceKind === 'storage' ? (
                                  submission.files.length > 0 ? (
                                    <>
                                      <div className={o.files}>
                                        {submission.files.map((file) => (
                                          <a
                                            key={`${submission.id}-${file.name}`}
                                            href={file.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className={o.file}
                                          >
                                            <FileText size={16} aria-hidden="true" />
                                            <span>{file.name}</span>
                                          </a>
                                        ))}
                                      </div>
                                      <p className={u.hint}>Links expire in 15 minutes.</p>
                                    </>
                                  ) : (
                                    <p className={o.quote}>
                                      No files found at {submission.reference ?? 'this reference'}.
                                    </p>
                                  )
                                ) : (
                                  <p className={o.quote}>{submission.reference ?? 'No reference on file.'}</p>
                                )}
                              </div>
                              <div className={o.detailMain}>
                                <dl className={u.facts}>
                                  <div>
                                    <dt>Person</dt>
                                    <dd>{repLabel(submission.userName, submission.userId)}</dd>
                                  </div>
                                  <div>
                                    <dt>Category</dt>
                                    <dd>{catLabel(submission)}</dd>
                                  </div>
                                  <div>
                                    <dt>Waiting</dt>
                                    <dd>{waitLabel(submission.submittedAt)}</dd>
                                  </div>
                                  <div>
                                    <dt>Access</dt>
                                    <dd>{submission.sensitive ? 'Sensitive / locked' : 'Standard'}</dd>
                                  </div>
                                </dl>
                                <p className={u.hint}>
                                  Submitted {formatDate(submission.submittedAt)} · {submission.userEmail}
                                </p>
                                <div className={u.btnRow}>
                                  <button
                                    type="button"
                                    className={`${s.btnPrimary} ${u.primarySm}`}
                                    disabled={working}
                                    onClick={() => review(submission, 'approved')}
                                  >
                                    {working ? 'Working…' : 'Approve'}
                                  </button>
                                  <button
                                    type="button"
                                    className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                                    disabled={working}
                                    onClick={() => openReject(submission)}
                                  >
                                    Reject
                                  </button>
                                  {isEsignItem(submission.itemId) && !submission.esignEnvelopeId && (
                                    <button
                                      type="button"
                                      className={`${s.btnSecondary} ${u.sm}`}
                                      disabled={working}
                                      onClick={() => void sendForSignature(submission)}
                                    >
                                      {working ? 'Sending…' : 'Send for signature'}
                                    </button>
                                  )}
                                </div>
                                {sendState[submission.id]?.message ? (
                                  <AdminNotice tone={sendState[submission.id].error ? 'error' : 'ok'}>
                                    {sendState[submission.id].message}
                                  </AdminNotice>
                                ) : null}
                              </div>
                            </div>
                          ) : null}
                        </li>
                      );
                    })}
                  </RepGroup>
                ))}
              </ul>
            </>
          )}
        </Section>

        {!loading && !loadFailed && filteredEsignPending.length > 0 && (
          <Section
            id="esign-pending-heading"
            title="Out for signature"
            count={`${filteredEsignPending.length} out`}
            sub="These documents are with the rep. Reject one only when a fresh signature is needed."
          >
            <div className={`${u.tHead} ${o.cols}`} aria-hidden="true">
              <span>Item</span>
              <span>Out for</span>
              <span>Access</span>
              <span>Status</span>
              <span />
            </div>
            <ul className={o.groups}>
              {groupSubmissions(filteredEsignPending).map((group) => (
                <RepGroup key={group.userId} group={group}>
                  {group.items.map((submission) => {
                    const expanded = expandedId === submission.id;
                    return (
                      <li key={submission.id} className={submission.atRisk ? u.rowWarn : undefined}>
                        <button
                          type="button"
                          className={`${u.row} ${o.itemRow}`}
                          onClick={() => setExpandedId(expanded ? null : submission.id)}
                          aria-expanded={expanded}
                        >
                          <span className={u.cellMain}>
                            <strong className={o.itemName}>{submission.itemLabel}</strong>
                            <span className={u.cellSub}>{catLabel(submission)}</span>
                          </span>
                          <span className={`${u.cell} ${u.num}`} data-label="Out for">
                            {waitLabel(submission.submittedAt)}
                          </span>
                          <span className={u.cell} data-label="Access">
                            <span className={o.access}>
                              {submission.sensitive ? <Lock size={14} aria-hidden="true" /> : null}
                              {submission.sensitive ? 'Sensitive' : 'E-signature'}
                            </span>
                          </span>
                          <span className={u.cell} data-label="Status">
                            <StatusDot tone="blue">Out for signature</StatusDot>
                          </span>
                          <span className={u.cellEnd}>
                            <ChevronDown
                              size={20}
                              className={`${u.chev} ${expanded ? o.chevOpen : ''}`}
                              aria-hidden="true"
                            />
                          </span>
                        </button>

                        {expanded ? (
                          <div className={o.detail}>
                            <div className={o.reference}>
                              <p className={s.kicker}>Reference</p>
                              <p className={o.quote}>
                                {submission.reference
                                  ? `E-signature reference: ${submission.reference}`
                                  : 'No envelope reference on file.'}
                              </p>
                            </div>
                            <div className={o.detailMain}>
                              <dl className={u.facts}>
                                <div>
                                  <dt>Person</dt>
                                  <dd>{repLabel(submission.userName, submission.userId)}</dd>
                                </div>
                                <div>
                                  <dt>Category</dt>
                                  <dd>{catLabel(submission)}</dd>
                                </div>
                                <div>
                                  <dt>Out for</dt>
                                  <dd>{waitLabel(submission.submittedAt)}</dd>
                                </div>
                                <div>
                                  <dt>Access</dt>
                                  <dd>Provider-managed</dd>
                                </div>
                              </dl>
                              <p className={u.hint}>
                                Dispatched {formatDate(submission.submittedAt)} · {submission.userEmail}
                                {submission.status === 'submitted' && submission.esignEnvelopeId
                                  ? ' · Awaiting rep signature'
                                  : ''}
                              </p>
                              <div className={u.btnRow}>
                                <button
                                  type="button"
                                  className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                                  disabled={processingId === submission.id}
                                  onClick={() => openReject(submission)}
                                >
                                  Reject
                                </button>
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </RepGroup>
              ))}
            </ul>
          </Section>
        )}

        {!loading && !loadFailed && (
          <Section
            id="completed-heading"
            title="Completed"
            count={`${filteredCompleted.length} completed`}
            sub="Approved and rejected items, newest review first."
          >
            {filteredCompleted.length === 0 ? (
              <p className={o.none}>Nothing completed yet.</p>
            ) : (
              <>
                <div className={`${u.tHead} ${o.cols}`} aria-hidden="true">
                  <span>Item</span>
                  <span>Reviewed</span>
                  <span>Reviewer</span>
                  <span>Signed PDF</span>
                  <span className={u.alignEnd}>Result</span>
                </div>
                <ul className={o.groups}>
                  {groupSubmissions(filteredCompleted).map((group) => (
                    <RepGroup key={group.userId} group={group}>
                      {group.items.map((submission) => (
                        <li key={submission.id} className={`${u.row} ${o.itemRow} ${o.doneRow}`}>
                          <span className={u.cellMain}>
                            <strong className={o.itemName}>{submission.itemLabel}</strong>
                            <span className={u.cellSub}>{catLabel(submission)}</span>
                          </span>
                          <span className={`${u.cell} ${u.num}`} data-label="Reviewed">
                            {formatDate(submission.reviewedAt)}
                          </span>
                          <span className={u.cell} data-label="Reviewer">
                            {submission.reviewerName || '—'}
                          </span>
                          <span className={u.cell} data-label="Signed PDF">
                            {submission.hasSignedPdf && submission.adminOnly ? (
                              <span className={`${u.tag} ${u.tagAmber}`}>
                                <Lock size={12} aria-hidden="true" />
                                Admin only
                              </span>
                            ) : submission.hasSignedPdf ? (
                              <button type="button" className={o.pdfBtn} onClick={() => openSignedPdf(submission)}>
                                <FileText size={16} aria-hidden="true" />
                                Signed PDF
                              </button>
                            ) : (
                              <span className={u.toneMuted}>No PDF</span>
                            )}
                          </span>
                          <span className={`${u.cellEnd} ${u.alignEnd}`}>
                            <StatusDot tone={submission.status === 'approved' ? 'lime' : 'red'}>
                              {submission.status === 'approved' ? 'Approved' : 'Rejected'}
                            </StatusDot>
                          </span>
                        </li>
                      ))}
                    </RepGroup>
                  ))}
                </ul>
              </>
            )}
          </Section>
        )}
      </div>

      {rejectModal ? (
        <AdminSheet
          title={`Reject ${rejectModal.itemLabel}`}
          tone="danger"
          description={`Give a reason. It is shared with ${repLabel(rejectModal.userName, rejectModal.userId)}.`}
          onClose={closeReject}
          footer={
            <>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                onClick={closeReject}
              >
                Cancel
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                disabled={processingId === rejectModal.id || !rejectionReason.trim()}
                onClick={() => review(rejectModal, 'rejected', rejectionReason)}
              >
                {processingId === rejectModal.id ? 'Rejecting…' : 'Confirm reject'}
              </button>
            </>
          }
        >
          <div className={u.sheetPad}>
            {rejectError ? (
              <AdminNotice tone="error" onDismiss={() => setRejectError('')}>
                {rejectError}
              </AdminNotice>
            ) : null}
            <div className={u.field}>
              <label className={u.label} htmlFor="onb-reject-reason">
                Reason
              </label>
              <textarea
                id="onb-reject-reason"
                className={`${u.input} ${u.textarea}`}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="What needs to change?"
                rows={3}
              />
            </div>
          </div>
        </AdminSheet>
      ) : null}
    </AdminGate>
  );
}

function StatPlaceholder({ failed }: { failed: boolean }) {
  if (failed) return <strong className={`${u.statValue} ${u.toneMuted}`}>—</strong>;
  return <span className={s.skel} style={{ width: 56, height: 40 }} aria-hidden="true" />;
}
