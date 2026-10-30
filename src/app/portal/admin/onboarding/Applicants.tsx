'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { hubTabHref, ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import t from './todo.module.css';
import { sourceLabel } from '@/lib/forms/applicationSource';
import type { ApplicationRecord } from '@/types';
import { timeAgo } from './checklist';
import { applicantHeadline, type ApplicantRow } from './todoRows';
import { TodoList, type TodoListItem } from './TodoList';

// Website applicants in Hiring > To do: a row each (what they want to sell,
// where, when they applied) with Invite at the end. Tapping the row opens the
// application in a sheet: how to reach them, where they came from, and Not a
// fit. Archived applicants get Restore instead.

export function inviteHref(applicationId: string): string {
  return `${hubTabHref(ONBOARDING_HUB, 'people')}&application=${encodeURIComponent(applicationId)}`;
}

/** "Oct 6", with the year once it isn't this year. */
function longDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  if (Number.isNaN(date.getTime())) return '';
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

export interface ApplicantActions {
  /** Applicants marked not a fit / restored right now (their button spins). */
  busyId: string | null;
  /** null hides "Not a fit" and Restore (the viewer can't archive). */
  onNotFit: ((application: ApplicationRecord) => void) | null;
  onRestore: ((application: ApplicationRecord) => void) | null;
  onOpen: (application: ApplicationRecord) => void;
}

/** "Not a fit · Oct 20 · by Jacob Myers". */
function archivedLine(application: ApplicationRecord): string {
  return [
    'Not a fit',
    longDate(application.notSelectedAt),
    application.notSelectedByName ? `by ${application.notSelectedByName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function ApplicantList({
  rows,
  actions,
  archived = false,
}: {
  rows: ApplicantRow[];
  actions: ApplicantActions;
  archived?: boolean;
}) {
  const button = `${s.btnSecondary} ${u.sm}`;
  const items: TodoListItem[] = rows.map((row) => {
    const { application } = row;
    const busy = actions.busyId === application.id;
    return {
      key: row.key,
      name: row.name,
      detail: archived ? archivedLine(application) : row.detail,
      when: archived ? '' : row.when,
      open: { label: `Open ${row.name}'s application`, onOpen: () => actions.onOpen(application) },
      action: archived ? (
        actions.onRestore ? (
          <button
            type="button"
            className={button}
            disabled={busy}
            aria-label={`Restore ${row.name}`}
            onClick={() => actions.onRestore?.(application)}
          >
            {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
            Restore
          </button>
        ) : null
      ) : (
        <Link href={inviteHref(application.id)} className={button} aria-label={`Invite ${row.name}`}>
          Invite
        </Link>
      ),
    };
  });
  return <TodoList items={items} />;
}

/** The application: who, how to reach them, where they came from. Only answers they gave. */
export function ApplicantSheet({
  application,
  actions,
  onClose,
}: {
  application: ApplicationRecord;
  actions: ApplicantActions;
  onClose: () => void;
}) {
  const archived = application.status === 'not_selected';
  const busy = actions.busyId === application.id;
  const applied = [longDate(application.createdAt), timeAgo(application.createdAt)].filter(Boolean).join(', ');
  const details: { label: string; value: ReactNode }[] = [
    {
      label: 'Phone',
      value: application.phone ? (
        <a className={t.detailLink} href={telHref(application.phone)}>
          {application.phone}
        </a>
      ) : null,
    },
    {
      label: 'Email',
      value: application.email ? (
        <a className={t.detailLink} href={`mailto:${application.email}`}>
          {application.email}
        </a>
      ) : null,
    },
    { label: 'Applied', value: applied || null },
    { label: 'Referred by', value: application.referredBy?.trim() || null },
    { label: 'Found us', value: sourceLabel(application.source) || null },
  ].filter((detail) => detail.value);

  return (
    <AdminSheet
      title={application.name || 'Applicant'}
      description={applicantHeadline(application) || undefined}
      onClose={onClose}
      footer={
        archived ? (
          actions.onRestore ? (
            <button
              type="button"
              className={`${s.btnPrimary} ${u.primarySm}`}
              disabled={busy}
              onClick={() => actions.onRestore?.(application)}
            >
              Restore
            </button>
          ) : null
        ) : (
          <>
            {actions.onNotFit ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm}`}
                disabled={busy}
                onClick={() => actions.onNotFit?.(application)}
              >
                {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
                Not a fit
              </button>
            ) : null}
            <Link href={inviteHref(application.id)} className={`${s.btnPrimary} ${u.primarySm}`}>
              Invite
            </Link>
          </>
        )
      }
    >
      <div className={u.sheetPad}>
        {archived ? <p className={u.hint}>{archivedLine(application)}.</p> : null}
        <dl className={t.details}>
          {details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </AdminSheet>
  );
}

/** "Brenden Tran moved to Archived. Undo" pinned above the tab bar; goes after 8 seconds. */
export function UndoToast({ text, onUndo, onDone }: { text: string; onUndo: () => void; onDone: () => void }) {
  useEffect(() => {
    const timer = window.setTimeout(onDone, 8000);
    return () => window.clearTimeout(timer);
  }, [text, onDone]);

  return (
    <BodyLayer>
      <div className={t.toast} role="status">
        <span className={t.toastText}>{text}</span>
        <button type="button" className={t.toastUndo} onClick={onUndo}>
          Undo
        </button>
      </div>
    </BodyLayer>
  );
}
