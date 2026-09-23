'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { ESIGN_FAILURE_HELPER_TEXT, ESIGN_HELPER_TEXT, isEsignItem } from '@/lib/onboarding/esign';
import { EsignSignAction } from '@/components/onboarding/EsignSignAction';
import type { WizardItem } from '@/components/onboarding/OnboardingWizard';
import type { OnboardingStatus } from '@/types/onboarding';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import o from './onboarding.module.css';

const STATUS_LABEL: Record<OnboardingStatus, string> = {
  not_started: 'To do',
  submitted: 'In review',
  approved: 'Done',
  rejected: 'Needs attention',
};

function nextActionLabel(item: WizardItem) {
  if (item.status === 'approved') return 'View';
  if (isEsignItem(item.id)) {
    return item.esignDispatch?.state === 'failed' ? 'Preparing' : 'Sign now';
  }
  if (item.status === 'rejected') return 'Resubmit';
  if (item.status === 'submitted') return 'View';
  // Manual-reference items (e.g. Onboarding Submission) are not uploads (B-18).
  if (item.referenceKind === 'manual') return 'Submit';
  return 'Upload';
}

/** The row button leads (lime outline) only when the next move is the rep's. */
function isRepsMove(item: WizardItem) {
  if (item.status === 'approved' || item.status === 'submitted') return false;
  if (isEsignItem(item.id)) return item.esignDispatch?.state !== 'failed';
  return true;
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function StatusPill({ status }: { status: OnboardingStatus }) {
  return (
    <span className={o.state} data-state={status}>
      {STATUS_LABEL[status]}
    </span>
  );
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

// Full always-visible checklist, direction D. Row next-actions that need real
// data entry open a focused sheet rather than rendering inline forms in the row.
// Presentation only: renderItemAction (passed in from the page) still owns
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
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const openId = openItem?.id ?? null;
  const sheetRef = useRef<HTMLElement | null>(null);

  // Focus Close when a different item opens, never on a re-render: the page
  // re-renders on every keystroke in the sheet, and refocusing then would drop
  // the rep's typing.
  useEffect(() => {
    if (openId) closeRef.current?.focus();
  }, [openId]);

  useEffect(() => {
    if (!openId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenItem(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openId, onOpenItem]);

  // iPhone keyboard: the sheet is fixed to the layout viewport's bottom, which
  // the keyboard covers. Lift it by the covered height (--kb) so the field and
  // Submit stay above the keys, as the chat composer does.
  useEffect(() => {
    const sheet = sheetRef.current;
    const vv = window.visualViewport;
    if (!openId || !sheet || !vv) return;
    const update = () => {
      const covered = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const inset = covered > 80 ? Math.round(covered) : 0;
      sheet.style.setProperty('--kb', `${inset}px`);
      if (inset) {
        sheet.dataset.kb = 'open';
        const active = document.activeElement;
        if (active instanceof HTMLElement && sheet.contains(active)) active.scrollIntoView({ block: 'nearest' });
      } else {
        delete sheet.dataset.kb;
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [openId]);

  return (
    <>
      <section className={s.panel} aria-labelledby="onboarding-progress-h">
        <div className={o.progress}>
          <h2 id="onboarding-progress-h" className={s.kicker}>
            Checklist for {memberLabel}
          </h2>
          <p className={o.score}>
            <span className={`${o.scoreNum} ${progress.complete ? o.progressDone : ''}`}>{progress.approved}</span>
            <span className={o.scoreOf}>/{progress.total}</span>
            <span className={o.scoreLabel}>{progress.complete ? 'All approved' : 'approved'}</span>
          </p>
          <span className={s.track} aria-hidden="true">
            <span className={s.fill} style={{ width: `${pct}%` }} />
          </span>
        </div>
      </section>

      <ul className={`${s.panel} ${o.list}`} aria-label="Onboarding items">
        {ordered.map((item) => (
          <li key={item.id} className={o.row} data-state={item.status}>
            <div className={o.rowText}>
              <StatusPill status={item.status} />
              <span className={o.rowName}>{item.label}</span>
              <span className={o.rowDesc}>{rowDescription(item)}</span>
            </div>
            <button
              type="button"
              className={`${s.btnSecondary} ${o.rowBtn} ${isRepsMove(item) ? o.rowBtnPrimary : ''}`}
              onClick={() => onOpenItem(item.id)}
              aria-label={`${nextActionLabel(item)}: ${item.label}`}
            >
              {nextActionLabel(item)}
            </button>
          </li>
        ))}
        {ordered.length === 0 && <li className={o.empty}>No onboarding items assigned yet. Your manager adds them.</li>}
      </ul>

      {/* Portaled to <body> through BodyLayer: iOS WebKit breaks position:fixed
          inside the app-shell <main> scroller (see SaleDetailSheet). */}
      {openItem ? (
        <BodyLayer>
          <div
            className={s.backdrop}
            onClick={(e) => {
              if (e.target === e.currentTarget) onOpenItem(null);
            }}
          >
            <section
              ref={sheetRef}
              className={`${s.sheet} ${o.sheet}`}
              role="dialog"
              aria-modal="true"
              aria-labelledby="onboarding-sheet-title"
              data-onboarding-sheet=""
            >
              <div className={s.sheetHandle} aria-hidden="true" />
              <div className={s.sheetHead}>
                <div className={o.sheetStatus}>
                  <StatusPill status={openItem.status} />
                  <h2 id="onboarding-sheet-title" className={s.sheetTitle}>
                    {openItem.label}
                  </h2>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  className={s.iconBtn}
                  aria-label="Close"
                  onClick={() => onOpenItem(null)}
                >
                  <X size={20} aria-hidden="true" />
                </button>
              </div>
              <div className={s.sheetBody}>
                <div className={o.sheetInner}>
                  <MemberLineOnboardingSheetBody
                    item={openItem}
                    renderItemAction={renderItemAction}
                    onRefresh={onRefresh}
                  />
                </div>
              </div>
            </section>
          </div>
        </BodyLayer>
      ) : null}
    </>
  );
}

function rowDescription(item: WizardItem) {
  if (item.status === 'rejected' && item.rejectionReason) return item.rejectionReason;
  if (isEsignItem(item.id) && item.status !== 'approved') {
    return item.esignDispatch?.state === 'failed' ? ESIGN_FAILURE_HELPER_TEXT : ESIGN_HELPER_TEXT;
  }
  if (item.status === 'approved') return 'Complete.';
  if (item.status === 'submitted') return 'Waiting for your manager to review it.';
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
      <p className={o.note}>
        Approved{item.reviewedAt ? ` ${formatDate(item.reviewedAt)}` : ''}
        {item.reviewerName ? ` by ${item.reviewerName}` : ''}.
      </p>
    );
  }

  return (
    <>
      {item.status === 'rejected' && item.rejectionReason && (
        <p className={`${o.note} ${o.noteWarn}`}>
          <strong>Returned{item.reviewerName ? ` by ${item.reviewerName}` : ''}</strong>
          {item.rejectionReason}
        </p>
      )}

      {isEsignItem(item.id) ? (
        item.esignSigningUrl ? (
          <EsignSignAction itemId={item.id} signingUrl={item.esignSigningUrl} onRefresh={onRefresh} />
        ) : (
          <p className={item.esignDispatch?.state === 'failed' ? `${o.note} ${o.noteWarn}` : o.note}>
            {item.esignDispatch?.state === 'failed' ? ESIGN_FAILURE_HELPER_TEXT : ESIGN_HELPER_TEXT}
          </p>
        )
      ) : (
        renderItemAction(item)
      )}
    </>
  );
}
