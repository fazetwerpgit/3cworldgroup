'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ESIGN_FAILURE_HELPER_TEXT,
  ESIGN_HELPER_TEXT,
  isEsignItem,
} from '@/lib/onboarding/esign';
import { EsignSignAction } from '@/components/onboarding/EsignSignAction';
import type { WizardItem } from '@/components/onboarding/OnboardingWizard';
import type { OnboardingStatus } from '@/types/onboarding';

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_started: 'To do',
  submitted: 'In review',
  approved: 'Done',
  rejected: 'Needs attention',
};

const STATUS_CLASS: Record<OnboardingStatus, string> = {
  not_started: 'todo',
  submitted: 'review',
  approved: 'done',
  rejected: 'attention',
};

function nextActionLabel(item: WizardItem) {
  if (item.status === 'approved') return 'View';
  if (isEsignItem(item.id)) {
    return item.esignDispatch?.state === 'failed' ? 'Preparing' : 'Sign now';
  }
  if (item.status === 'rejected') return 'Resubmit';
  if (item.status === 'submitted') return 'In review';
  // Manual-reference items (e.g. Onboarding Submission) are not uploads (B-18).
  if (item.referenceKind === 'manual') return 'Submit';
  return 'Upload';
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

interface Props {
  memberLabel: string;
  items: WizardItem[];
  progress: { approved: number; total: number; complete: boolean };
  renderItemAction: (item: WizardItem) => ReactNode;
  openItemId: string | null;
  onOpenItem: (id: string | null) => void;
  onRefresh: () => void;
}

// Full always-visible checklist board — the mockup's primary/default onboarding
// view (Orchestrator ruling 1: hybrid). Row next-actions that need real data
// entry open a focused sheet rather than rendering inline forms in the row.
// Zero changes to completion predicates, write paths, or step data here —
// presentation only; renderItemAction (passed in from the page) still owns
// every real upload/submit/reference interaction.
export default function MemberLineOnboardingBoard({
  memberLabel,
  items,
  progress,
  renderItemAction,
  openItemId,
  onOpenItem,
  onRefresh,
}: Props) {
  const ordered = [...items].sort((a, b) => a.order - b.order);
  const openItem = ordered.find((item) => item.id === openItemId) ?? null;
  const pct = progress.total === 0 ? 0 : Math.round((progress.approved / progress.total) * 100);

  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openItem, onOpenItem]);

  return (
    <>
      <section className="member-line-panel">
        <div className="member-line-panel-head">
          <div>
            <p className="member-line-eyebrow">01 / the board</p>
            <h2>
              {memberLabel} / onboarding
            </h2>
          </div>
          <span className="member-line-meta">{progress.approved} approved</span>
        </div>

        <div className="member-line-progress">
          <span style={{ width: `${pct}%` }} />
        </div>
        <p className="member-line-meta">
          {progress.approved} of {progress.total} approved / one progress readout
        </p>

        <div className="member-line-board" style={{ marginTop: 16 }}>
          {ordered.map((item) => (
            <div key={item.id} className={`member-line-row ${item.status === 'rejected' ? 'attention' : ''}`}>
              <span className={`member-line-state ${STATUS_CLASS[item.status]}`}>{STATUS_LABEL[item.status]}</span>
              <div>
                <strong>{item.label}</strong>
                <small>{rowDescription(item)}</small>
              </div>
              <button type="button" className="member-line-next" onClick={() => onOpenItem(item.id)}>
                {nextActionLabel(item)}
              </button>
            </div>
          ))}
          {ordered.length === 0 && (
            <div className="member-line-row">
              <span className="member-line-state todo">—</span>
              <div>
                <strong>No onboarding items assigned</strong>
              </div>
              <span className="member-line-next" />
            </div>
          )}
        </div>
      </section>

      {/* Portaled to <body>: iOS WebKit breaks position:fixed inside the
          app-shell <main> scroller (sheet clipped under the header with no
          way out — see SaleDetailSheet). The display:contents wrapper keeps
          the .member-line custom-property palette in scope. */}
      {openItem && typeof document !== 'undefined' && createPortal(
        <div className="member-line" style={{ display: 'contents' }}>
        <div
          className="member-line-sheet-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={openItem.label}
          onClick={(e) => {
            if (e.target === e.currentTarget) onOpenItem(null);
          }}
        >
          <div className="member-line-sheet">
            <div className="member-line-sheet-head">
              <div>
                <p className="member-line-eyebrow">{STATUS_LABEL[openItem.status]}</p>
                <h2 style={{ margin: '4px 0 0', fontFamily: 'var(--member-line-serif)', fontWeight: 600, fontSize: 20 }}>
                  {openItem.label}
                </h2>
              </div>
              <button type="button" className="member-line-sheet-close" onClick={() => onOpenItem(null)}>
                Close
              </button>
            </div>
            <MemberLineOnboardingSheetBody
              item={openItem}
              renderItemAction={renderItemAction}
              onRefresh={onRefresh}
            />
          </div>
        </div>
        </div>,
        document.body
      )}
    </>
  );
}

function rowDescription(item: WizardItem) {
  if (item.status === 'rejected' && item.rejectionReason) return item.rejectionReason;
  if (isEsignItem(item.id) && item.status !== 'approved') {
    return item.esignDispatch?.state === 'failed' ? ESIGN_FAILURE_HELPER_TEXT : ESIGN_HELPER_TEXT;
  }
  if (item.status === 'approved') return 'Complete.';
  return 'Open the item for the next step.';
}

function MemberLineOnboardingSheetBody({
  item,
  renderItemAction,
  onRefresh,
}: {
  item: WizardItem;
  renderItemAction: (item: WizardItem) => ReactNode;
  onRefresh: () => void;
}) {
  if (item.status === 'approved') {
    return (
      <div className="member-line-note">
        Approved{item.reviewedAt ? ` ${formatDate(item.reviewedAt)}` : ''}
        {item.reviewerName ? ` by ${item.reviewerName}` : ''}.
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {item.status === 'rejected' && item.rejectionReason && (
        <div className="member-line-note warn">
          <strong>Returned{item.reviewerName ? ` by ${item.reviewerName}` : ''}</strong>
          <br />
          {item.rejectionReason}
        </div>
      )}

      {isEsignItem(item.id) ? (
        item.esignSigningUrl ? (
          <EsignSignAction itemId={item.id} signingUrl={item.esignSigningUrl} onRefresh={onRefresh} />
        ) : (
          <div className="member-line-note warn">
            {item.esignDispatch?.state === 'failed' ? ESIGN_FAILURE_HELPER_TEXT : ESIGN_HELPER_TEXT}
          </div>
        )
      ) : (
        renderItemAction(item)
      )}
    </div>
  );
}
