'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, FileText, Lock, RotateCw } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import { MarkCompleteSheet, type MarkCompleteTarget } from './MarkCompleteSheet';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
  type Tone,
} from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { Collapse } from '@/components/portal/Collapse';
import { useAttachmentViewer } from '@/components/portal/rep/ImageViewer';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import o from './admin-onboarding.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { isEsignItem } from '@/lib/onboarding/esign';
import { isOwner, OnboardingCategoryLabels, type OnboardingCategory, type OnboardingStatus } from '@/types';

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

interface ChecklistItem {
  id: string;
  userId: string;
  itemId: string;
  itemLabel: string;
  category: OnboardingCategory;
  sensitive: boolean;
  /** Sensitive item whose files this caller (operations) may not open. */
  adminOnly: boolean;
  referenceKind: 'vendor' | 'storage' | 'esign' | 'manual';
  reference: string | null;
  files: { name: string; url: string; contentType: string }[];
  status: OnboardingStatus;
  /** Unsigned placeholder document on hold: shown, but nobody is waiting on it. */
  onHold: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewerName: string | null;
  rejectionReason: string | null;
  esignEnvelopeId: string | null;
  hasSignedPdf: boolean;
  /** Set when an owner marked the item complete by hand. */
  manualCompletion: { note: string; byName: string; at: string | null } | null;
}

interface Person {
  userId: string;
  userName: string;
  userEmail: string;
  roleLabel: string | null;
  atRisk: boolean;
  items: ChecklistItem[];
  done: number;
  total: number;
  /** Submitted, waiting on management. */
  toReview: number;
  /** Out for signature, waiting on the rep. */
  unsigned: number;
}

type View = 'all' | 'new' | 'handled';

/** New: something submitted is waiting (review or signature). Handled: everyone else. */
function isNew(person: Person) {
  return person.toReview + person.unsigned > 0;
}

function waitLabel(submittedAt: string | null): string {
  if (!submittedAt) return 'unknown wait';
  const ms = Date.now() - new Date(submittedAt).getTime();
  if (Number.isNaN(ms) || ms < 0) return 'unknown wait';
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'under an hour';
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function formatDate(date: string | null) {
  if (!date) return '';
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function personStatus(person: Person): { tone: Tone; label: string } {
  if (person.toReview > 0) return { tone: 'amber', label: 'Needs review' };
  if (person.unsigned > 0) return { tone: 'blue', label: 'Out for signature' };
  if (person.total > 0 && person.done === person.total) return { tone: 'lime', label: 'Complete' };
  return { tone: 'muted', label: 'In progress' };
}

function itemStatus(item: ChecklistItem): { tone: Tone; label: string } {
  if (item.onHold) return { tone: 'muted', label: 'On hold' };
  switch (item.status) {
    case 'approved':
      return { tone: 'lime', label: 'Approved' };
    case 'rejected':
      return { tone: 'red', label: 'Rejected' };
    case 'submitted':
      if (!isEsignItem(item.itemId)) return { tone: 'amber', label: 'Needs review' };
      return item.esignEnvelopeId ? { tone: 'blue', label: 'Out for signature' } : { tone: 'amber', label: 'Not sent' };
    default:
      return { tone: 'muted', label: 'Not started' };
  }
}

function itemDetail(item: ChecklistItem): string | null {
  if (item.onHold) return "Placeholder on hold until 3C sends the real document. The rep isn't asked to sign it.";
  switch (item.status) {
    case 'approved':
      if (item.manualCompletion) {
        return `Marked complete by ${item.manualCompletion.byName}: ${item.manualCompletion.note}`;
      }
      return `Approved ${formatDate(item.reviewedAt)}${item.reviewerName ? ` by ${item.reviewerName}` : ''}`;
    case 'rejected':
      return `Rejected ${formatDate(item.reviewedAt)}${item.reviewerName ? ` by ${item.reviewerName}` : ''}${
        item.rejectionReason ? `: ${item.rejectionReason}` : ''
      }`;
    case 'submitted':
      return `${isEsignItem(item.itemId) ? 'Sent' : 'Submitted'} ${formatDate(item.submittedAt)} · ${waitLabel(item.submittedAt)}`;
    default:
      return null;
  }
}

export default function OnboardingReviewPage() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadFailed, setLoadFailed] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [rejectTarget, setRejectTarget] = useState<{ item: ChecklistItem; repName: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  // Reject failures show inside the sheet; the page banner sits behind it.
  const [rejectError, setRejectError] = useState('');
  const [notice, setNotice] = useState('');
  const [view, setView] = useState<View>('new');
  const [atRiskOnly, setAtRiskOnly] = useState(false);
  const [openIds, setOpenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [markTarget, setMarkTarget] = useState<MarkCompleteTarget | null>(null);
  const canMarkComplete = isOwner(user?.role);
  // In-app viewer, not a new tab: a tab opened after an await is blocked or
  // opens blank in Safari and strands an iPhone home-screen app.
  const viewer = useAttachmentViewer();

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
      setPeople(Array.isArray(json.people) ? json.people : []);
      setLoadFailed(false);
    } catch {
      if (background) {
        setError("Couldn't refresh the list. Tap refresh to try again.");
      } else {
        // A failed load says so (with a retry) instead of showing an empty list.
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

  const toggle = (userId: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (!next.delete(userId)) next.add(userId);
      return next;
    });

  const closeReject = () => {
    setRejectTarget(null);
    setRejectionReason('');
    setRejectError('');
  };

  // The signed-pdf route verifies a Bearer token, which a plain link cannot
  // send. The viewer fetches it with the token and draws it in the page, as
  // the e-sign reader does.
  const openSignedPdf = (item: ChecklistItem, repName: string, opener: HTMLElement) =>
    viewer.showDocument(
      `/api/portal/onboarding/signed-pdf?userId=${encodeURIComponent(item.userId)}&itemId=${encodeURIComponent(item.itemId)}`,
      `${item.itemLabel}, signed by ${repName}`,
      authHeaders,
      opener
    );

  const review = async (
    item: ChecklistItem,
    status: 'approved' | 'rejected',
    repName: string,
    reason?: string
  ) => {
    if (!user) return;
    setProcessingId(item.id);
    const fail = status === 'rejected' ? setRejectError : setError;
    fail('');
    try {
      const response = await fetch('/api/portal/onboarding/review', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({
          userId: item.userId,
          itemId: item.itemId,
          status,
          rejectionReason: reason,
        }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to review submission');
      closeReject();
      if (status === 'approved') setNotice(`${item.itemLabel} approved for ${repName}.`);
      await fetchQueue(true);
    } catch (err) {
      fail(err instanceof Error ? err.message : 'Failed to review submission');
    } finally {
      setProcessingId(null);
    }
  };

  const sendForSignature = async (item: ChecklistItem, repName: string) => {
    if (!user) return;
    setProcessingId(item.id);
    setError('');
    try {
      const response = await fetch('/api/portal/onboarding/esign-send', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ userId: item.userId, itemId: item.itemId }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to send for signature');
      setNotice(
        json.reason === 'envelope_exists'
          ? `${item.itemLabel} was already sent to ${repName}.`
          : `Sent ${item.itemLabel} to ${repName}. They can sign it in their portal.`
      );
      await fetchQueue(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send for signature');
    } finally {
      setProcessingId(null);
    }
  };

  const visible = useMemo(
    () =>
      people.filter(
        (person) =>
          (view === 'all' || (view === 'new') === isNew(person)) && (!atRiskOnly || person.atRisk)
      ),
    [people, view, atRiskOnly]
  );

  const newCount = people.filter(isNew).length;
  const toReviewTotal = people.reduce((sum, person) => sum + person.toReview, 0);
  const unsignedTotal = people.reduce((sum, person) => sum + person.unsigned, 0);
  const atRiskPeople = people.filter((person) => person.atRisk && isNew(person)).length;
  const showStats = !loading && !loadFailed;

  const renderItem = (item: ChecklistItem, repName: string) => {
    const status = itemStatus(item);
    const detail = itemDetail(item);
    const working = processingId === item.id;
    const esign = isEsignItem(item.itemId);
    const underReview = item.status === 'submitted' && !esign;
    const showPdf = esign && item.status === 'approved' && item.hasSignedPdf;
    const markable = canMarkComplete && item.status !== 'approved';
    const pending = item.status === 'submitted' && !item.onHold;
    const hasActions = pending || showPdf || markable;
    return (
      <li key={item.id} className={o.item}>
        <div className={o.itemHead}>
          <span className={o.itemText}>
            <strong className={o.itemName}>{item.itemLabel}</strong>
            <span className={u.cellSub}>
              {OnboardingCategoryLabels[item.category] ?? item.category}
              {item.sensitive ? ' · Sensitive' : ''}
            </span>
          </span>
          <StatusDot tone={status.tone}>{status.label}</StatusDot>
        </div>
        {detail ? <p className={o.itemDetail}>{detail}</p> : null}

        {underReview ? (
          <div className={o.reference}>
            {item.referenceKind === 'storage' && item.adminOnly ? (
              <p className={o.locked}>
                <Lock size={16} aria-hidden="true" />
                Admin only. Sensitive files are visible to admins.
              </p>
            ) : item.referenceKind === 'storage' ? (
              item.files.length > 0 ? (
                <>
                  <div className={o.files}>
                    {item.files.map((file) =>
                      // Photos open in the page. A PDF (or a HEIC, which only
                      // Apple's browsers draw) stays a link: a real tap opens it.
                      /^image\/(jpeg|png|webp)$/.test(file.contentType) ? (
                        <button
                          key={`${item.id}-${file.name}`}
                          type="button"
                          className={`${o.file} ${o.fileBtn}`}
                          onClick={(event) => viewer.show(file.url, `${item.itemLabel}: ${file.name}`, event.currentTarget)}
                        >
                          <FileText size={16} aria-hidden="true" />
                          <span>{file.name}</span>
                        </button>
                      ) : (
                        <a
                          key={`${item.id}-${file.name}`}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={o.file}
                        >
                          <FileText size={16} aria-hidden="true" />
                          <span>{file.name}</span>
                        </a>
                      )
                    )}
                  </div>
                  <p className={u.hint}>Links expire in 15 minutes.</p>
                </>
              ) : (
                <p className={o.quote}>No files found at {item.reference ?? 'this reference'}.</p>
              )
            ) : (
              <p className={o.quote}>{item.reference ?? 'No reference on file.'}</p>
            )}
          </div>
        ) : null}

        {hasActions ? (
          <div className={u.btnRow}>
            {underReview ? (
              <button
                type="button"
                className={`${s.btnPrimary} ${u.primarySm}`}
                disabled={working}
                onClick={() => void review(item, 'approved', repName)}
              >
                {working ? 'Working…' : 'Approve'}
              </button>
            ) : null}
            {pending ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                disabled={working}
                onClick={() => {
                  setRejectError('');
                  setRejectTarget({ item, repName });
                }}
              >
                Reject
              </button>
            ) : null}
            {esign && pending && !item.esignEnvelopeId ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                disabled={working}
                onClick={() => void sendForSignature(item, repName)}
              >
                {working ? 'Sending…' : 'Send for signature'}
              </button>
            ) : null}
            {showPdf && item.adminOnly ? (
              <span className={`${u.tag} ${u.tagAmber}`}>
                <Lock size={12} aria-hidden="true" />
                Admin only
              </span>
            ) : showPdf ? (
              <button
                type="button"
                className={o.pdfBtn}
                onClick={(event) => openSignedPdf(item, repName, event.currentTarget)}
              >
                <FileText size={16} aria-hidden="true" />
                Signed PDF
              </button>
            ) : null}
            {markable ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                disabled={working}
                onClick={() =>
                  setMarkTarget({ userId: item.userId, itemId: item.itemId, itemLabel: item.itemLabel, repName })
                }
              >
                Mark complete
              </button>
            ) : null}
          </div>
        ) : null}
      </li>
    );
  };

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="Onboarding Review"
          meta={
            showStats ? (
              <>
                <b>{toReviewTotal}</b> to review
                {unsignedTotal ? ` · ${unsignedTotal} out for signature` : null}
                {atRiskPeople ? ` · ${atRiskPeople} at risk` : null}
              </>
            ) : null
          }
        />

        <ActionQueue />

        <div className={u.toolbar}>
          <div className={u.segmented} role="group" aria-label="Filter people">
            <button type="button" aria-pressed={view === 'new'} onClick={() => setView('new')}>
              New{showStats ? ` ${newCount}` : ''}
            </button>
            <button type="button" aria-pressed={view === 'handled'} onClick={() => setView('handled')}>
              Handled
            </button>
            <button type="button" aria-pressed={view === 'all'} onClick={() => setView('all')}>
              All
            </button>
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

        <section className={s.panel} aria-labelledby="onb-people">
          <div className={`${s.panelHead} ${u.band}`}>
            <h2 id="onb-people" className={s.kicker}>
              People
            </h2>
            <span className={o.headRight}>
              {showStats ? <span className={u.panelMeta}>{visible.length} of {people.length}</span> : null}
              <button
                type="button"
                className={s.iconBtn}
                onClick={retryLoad}
                disabled={loading}
                aria-label="Refresh onboarding"
              >
                <RotateCw size={18} className={loading ? u.spin : undefined} aria-hidden="true" />
              </button>
            </span>
          </div>

          {loading ? (
            <AdminSkeletonRows rows={3} label="Loading onboarding" />
          ) : loadFailed ? (
            <AdminFailed what="onboarding" onRetry={retryLoad} />
          ) : visible.length === 0 ? (
            view === 'new' && !atRiskOnly ? (
              <AdminEmpty title="Nothing waiting">No one has onboarding waiting on review or a signature.</AdminEmpty>
            ) : (
              <AdminEmpty title="No one matches this view">Change the filter to see more people.</AdminEmpty>
            )
          ) : (
            <>
              <div className={`${u.tHead} ${o.cols}`} aria-hidden="true">
                <span>Person</span>
                <span>Done</span>
                <span>Waiting</span>
                <span>Status</span>
                <span />
              </div>
              <ul className={`${u.rows} ${o.cols}`}>
                {visible.map((person) => {
                  const open = openIds.has(person.userId);
                  // The API falls back to the uid when there is no name, so "name equals uid" is unnamed.
                  const name =
                    person.userName && person.userName !== person.userId
                      ? person.userName
                      : `Unnamed rep · ${person.userId.slice(-6)}`;
                  const status = personStatus(person);
                  const panelId = `onb-person-${person.userId}`;
                  return (
                    <li
                      key={person.userId}
                      className={person.atRisk ? u.rowWarn : isNew(person) ? u.rowHot : undefined}
                    >
                      <button
                        type="button"
                        className={u.row}
                        onClick={() => toggle(person.userId)}
                        aria-expanded={open}
                        aria-controls={panelId}
                      >
                        <span className={`${u.cellMain} ${u.person}`}>
                          <span className={u.personText}>
                            <span className={u.personName}>
                              <span>{name}</span>
                              {person.atRisk ? (
                                <span className={`${u.tag} ${u.tagAmber}`}>
                                  <AlertTriangle size={12} aria-hidden="true" />
                                  At risk
                                </span>
                              ) : null}
                            </span>
                            <span className={u.personSub}>{person.roleLabel ?? person.userEmail}</span>
                          </span>
                        </span>
                        <span className={`${u.cell} ${u.num}`} data-label="Done">
                          {person.done} of {person.total} done
                        </span>
                        <span className={u.cell} data-label="Waiting">
                          {isNew(person) ? (
                            <span className={o.waiting}>
                              {person.toReview ? (
                                <span className={`${u.tag} ${u.tagAmber}`}>{person.toReview} to review</span>
                              ) : null}
                              {person.unsigned ? <span className={u.tag}>{person.unsigned} unsigned</span> : null}
                            </span>
                          ) : (
                            <span className={u.toneMuted}>Nothing</span>
                          )}
                        </span>
                        <span className={u.cell} data-label="Status">
                          <StatusDot tone={status.tone}>{status.label}</StatusDot>
                        </span>
                        <span className={u.cellEnd}>
                          <ChevronDown
                            size={20}
                            className={`${u.chev} ${o.chev} ${open ? o.chevOpen : ''}`}
                            aria-hidden="true"
                          />
                        </span>
                      </button>
                      <Collapse open={open} id={panelId} className={o.personItems}>
                        {person.items.length === 0 ? (
                          <p className={o.none}>No onboarding items apply to this person.</p>
                        ) : (
                          <ul className={o.items}>{person.items.map((item) => renderItem(item, name))}</ul>
                        )}
                      </Collapse>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </section>
      </div>

      {rejectTarget ? (
        <AdminSheet
          title={`Reject ${rejectTarget.item.itemLabel}`}
          tone="danger"
          description={`Give a reason. It is shared with ${rejectTarget.repName}.`}
          onClose={closeReject}
          footer={
            <>
              <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={closeReject}>
                Cancel
              </button>
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
                disabled={processingId === rejectTarget.item.id || !rejectionReason.trim()}
                onClick={() => void review(rejectTarget.item, 'rejected', rejectTarget.repName, rejectionReason)}
              >
                {processingId === rejectTarget.item.id ? 'Rejecting…' : 'Confirm reject'}
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

      {viewer.viewer}

      {markTarget ? (
        <MarkCompleteSheet
          target={markTarget}
          onClose={() => setMarkTarget(null)}
          onDone={() => {
            setNotice(`${markTarget.itemLabel} marked complete for ${markTarget.repName}.`);
            setMarkTarget(null);
            void fetchQueue(true);
          }}
        />
      ) : null}
    </AdminGate>
  );
}
