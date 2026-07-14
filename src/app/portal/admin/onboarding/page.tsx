'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { useAuth } from '@/contexts/AuthContext';
import { OnboardingCategory, OnboardingCategoryLabels } from '@/types';

interface Submission {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
  userName: string;
  userEmail: string;
  atRisk: boolean;
  submittedAt: string | null;
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

function waitLabel(submittedAt: string | null): string {
  if (!submittedAt) return 'unknown wait';
  const ms = Date.now() - new Date(submittedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'unknown wait';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 24) return `${hours || 1} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

export default function OnboardingReviewPage() {
  const { user } = useAuth();
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectModal, setRejectModal] = useState<Submission | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [personFilter, setPersonFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState<OnboardingCategory | 'all'>('all');
  const [atRiskOnly, setAtRiskOnly] = useState(false);

  const fetchQueue = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch(`/api/portal/onboarding/review?requestedBy=${user.uid}`);
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load review queue');
      setSubmissions(json.submissions);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { fetchQueue(); }, [fetchQueue]);

  const review = async (submission: Submission, status: 'approved' | 'rejected', reason?: string) => {
    if (!user) return;
    setProcessingId(submission.id);
    setError('');
    try {
      const response = await fetch('/api/portal/onboarding/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: submission.userId,
          itemId: submission.itemId,
          status,
          reviewerId: user.uid,
          reviewerName: user.displayName || user.email,
          rejectionReason: reason,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to review submission');
      setSubmissions((prev) => prev.filter((s) => s.id !== submission.id));
      setRejectModal(null);
      setRejectionReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to review submission');
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
    submissions.forEach((s) => {
      const key = repKey(s.userName, s.userId);
      if (!seen.has(key)) seen.set(key, repLabel(s.userName, s.userId));
    });
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [submissions]);
  const categories = useMemo(
    () => Array.from(new Set(submissions.map((s) => s.category))),
    [submissions]
  );

  const filtered = useMemo(
    () =>
      submissions.filter(
        (s) =>
          (personFilter === 'all' || repKey(s.userName, s.userId) === personFilter) &&
          (categoryFilter === 'all' || s.category === categoryFilter) &&
          (!atRiskOnly || s.atRisk)
      ),
    [submissions, personFilter, categoryFilter, atRiskOnly]
  );

  return (
    <ProtectedRoute roles={['admin', 'operations']}>
      <div className="ops-line-main -m-4 sm:-m-6 p-4 sm:p-6">
        <div className="ops-line">
          <div className="ops-line-ticker">
            <b>ON AIR</b>
            <span>Ops signal / onboarding review · people on deck</span>
            <strong>QUEUE LIVE</strong>
          </div>

          <div className="ops-line-hero">
            <div>
              <p className="ops-line-kicker">03 / The Line / people on deck</p>
              <h1><span>Clear</span><br />the people.</h1>
              <p className="ops-line-intro">
                Keep one queue model for every document. Filters make the work narrow; the activation rail makes the
                handoff obvious.
              </p>
            </div>
            <div className="ops-line-hero-count">
              <strong className="ops-line-display portal-metallic-num">{submissions.length}</strong>
              <small>submissions waiting</small>
            </div>
          </div>

          <div className="ops-line-onboarding-filters">
            <span className="ops-line-kicker">Person</span>
            <div className="ops-line-pill-row" role="group" aria-label="Person filter">
              <button type="button" aria-pressed={personFilter === 'all'} onClick={() => setPersonFilter('all')}>
                All people
              </button>
              {people.map((p) => (
                <button key={p.key} type="button" aria-pressed={personFilter === p.key} onClick={() => setPersonFilter(p.key)}>
                  {p.label}
                </button>
              ))}
            </div>
            <span className="ops-line-kicker">Category</span>
            <div className="ops-line-pill-row" role="group" aria-label="Category filter">
              <button type="button" aria-pressed={categoryFilter === 'all'} onClick={() => setCategoryFilter('all')}>
                All
              </button>
              {categories.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={categoryFilter === c}
                  onClick={() => setCategoryFilter(c)}
                >
                  {OnboardingCategoryLabels[c] ?? c}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="ops-line-at-risk"
              aria-pressed={atRiskOnly}
              onClick={() => setAtRiskOnly((v) => !v)}
            >
              At-risk only
            </button>
          </div>

          {error && <div className="ops-line-error-banner">{error}</div>}

          {loading ? (
            <div className="ops-line-state-card">Loading submissions…</div>
          ) : filtered.length === 0 ? (
            <div className="ops-line-state-card">
              <p style={{ fontWeight: 900, marginBottom: 4 }}>
                {submissions.length === 0 ? 'Review queue is clear' : 'No submissions match this view.'}
              </p>
              <p>
                {submissions.length === 0
                  ? 'No onboarding submissions need review right now.'
                  : 'Clear filters to return to FIFO.'}
              </p>
            </div>
          ) : (
            <div className="ops-line-list">
              {filtered.map((submission) => {
                const expanded = expandedId === submission.id;
                return (
                  <article key={submission.id} className={`ops-line-row${submission.atRisk ? ' risk' : ''}`}>
                    <button
                      type="button"
                      className="ops-line-row-main onboard"
                      onClick={() => setExpandedId(expanded ? null : submission.id)}
                      aria-expanded={expanded}
                    >
                      <span className="ops-line-person ops-line-cell">
                        <span className="ops-line-avatar">
                          {repLabel(submission.userName, submission.userId).charAt(0).toUpperCase()}
                        </span>
                        <span>
                          <strong>
                            {repLabel(submission.userName, submission.userId)}
                            {submission.atRisk && ' · AT RISK'}
                          </strong>
                          <small>{submission.itemLabel}</small>
                        </span>
                      </span>
                      <span className="ops-line-cell">
                        <strong>{OnboardingCategoryLabels[submission.category] ?? submission.category}</strong>
                        <small>{waitLabel(submission.submittedAt)} waiting</small>
                      </span>
                      <span className="ops-line-cell">
                        <strong className="ops-line-sensitive">
                          {submission.sensitive && <Lock className="h-3 w-3" aria-hidden="true" />}
                          {submission.sensitive ? 'Sensitive item' : 'Standard review'}
                        </strong>
                        <small>FIFO position</small>
                      </span>
                      <span className="ops-line-evidence-group">
                        <span className="ops-line-file-chip">
                          {submission.referenceKind === 'storage'
                            ? `${submission.files.length} file${submission.files.length === 1 ? '' : 's'}`
                            : submission.referenceKind === 'esign'
                              ? 'e-signature'
                              : 'reference'}
                        </span>
                      </span>
                      <span className="ops-line-status-chip">waiting</span>
                      <span className="ops-line-chevron">{expanded ? '−' : '+'}</span>
                    </button>

                    {expanded && (
                      <div className="ops-line-detail-panel onboard">
                        <div className="ops-line-reference-card">
                          <p className="ops-line-kicker">Reference / preview</p>
                          {submission.referenceKind === 'storage' ? (
                            submission.files.length > 0 ? (
                              <>
                                <div className="ops-line-evidence-group" style={{ marginTop: 12 }}>
                                  {submission.files.map((file) => (
                                    <a
                                      key={`${submission.id}-${file.name}`}
                                      href={file.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="ops-line-file-chip"
                                    >
                                      {file.name}
                                    </a>
                                  ))}
                                </div>
                                <p style={{ marginTop: 10, fontSize: 10, color: 'var(--ops-line-muted)' }}>
                                  Links expire in 15 minutes.
                                </p>
                              </>
                            ) : (
                              <p className="quote">No files found at {submission.reference ?? 'this reference'}.</p>
                            )
                          ) : submission.referenceKind === 'esign' ? (
                            <p className="quote">
                              {submission.reference ? `E-signature reference: ${submission.reference}` : 'No confirmation entered.'}
                            </p>
                          ) : (
                            <p className="quote">{submission.reference ?? 'No reference on file.'}</p>
                          )}
                        </div>
                        <div className="ops-line-detail-copy">
                          <h3>{submission.itemLabel}</h3>
                          <div className="ops-line-detail-fields">
                            <div><span>Person</span><b>{repLabel(submission.userName, submission.userId)}</b></div>
                            <div><span>Category</span><b>{OnboardingCategoryLabels[submission.category] ?? submission.category}</b></div>
                            <div><span>Waiting</span><b>{waitLabel(submission.submittedAt)}</b></div>
                            <div><span>Access</span><b>{submission.sensitive ? 'Sensitive / locked' : 'Standard'}</b></div>
                          </div>
                          <p style={{ fontSize: 11, color: 'var(--ops-line-muted)' }}>
                            Submitted {formatDate(submission.submittedAt)} · {submission.userEmail}
                          </p>
                          <div className="ops-line-detail-actions">
                            <button
                              type="button"
                              className="ops-line-action resolve"
                              disabled={processingId === submission.id}
                              onClick={() => review(submission, 'approved')}
                            >
                              {processingId === submission.id ? 'Working…' : 'Approve'}
                            </button>
                            <button
                              type="button"
                              className="ops-line-action reject"
                              disabled={processingId === submission.id}
                              onClick={() => setRejectModal(submission)}
                            >
                              Reject
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}

          <ActionQueue />
        </div>
      </div>

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="ops-line w-full max-w-md" style={{ margin: 0, padding: 0 }}>
            <div className="ops-line-reference-card" style={{ background: 'var(--ops-line-panel)' }}>
              <h3 style={{ fontWeight: 900, fontSize: 16, color: 'var(--ops-line-ink)', marginBottom: 6 }}>
                Reject {rejectModal.itemLabel}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--ops-line-muted)', marginBottom: 10 }}>
                Provide a reason for rejection. This will be shared with {rejectModal.userName}.
              </p>
              <textarea
                className="ops-line-notes"
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder="Enter rejection reason..."
                rows={3}
              />
              <div className="ops-line-detail-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="ops-line-action"
                  onClick={() => { setRejectModal(null); setRejectionReason(''); }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="ops-line-action reject"
                  disabled={processingId === rejectModal.id || !rejectionReason.trim()}
                  onClick={() => review(rejectModal, 'rejected', rejectionReason)}
                >
                  {processingId === rejectModal.id ? 'Rejecting…' : 'Confirm reject'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}
