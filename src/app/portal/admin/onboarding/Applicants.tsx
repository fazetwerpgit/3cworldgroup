'use client';

import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { Loader2, Mail, Phone } from 'lucide-react';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import { hubTabHref, ONBOARDING_HUB } from '@/components/portal/admin-d/adminHubs';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import t from './todo.module.css';
import { interestLabels } from '@/lib/forms/applicationInterests';
import { sourceLabel } from '@/lib/forms/applicationSource';
import type { ApplicationRecord } from '@/types';
import { timeAgo } from './checklist';
import { applicantHeadline, type ApplicantRow } from './todoRows';

// Website applicants in Hiring > To do: a card with who they are and how to
// reach them, Invite as the main action and "Not a fit" beside it. Tapping the
// card opens the whole application in a sheet. Archived applicants get Restore.

export function inviteHref(applicationId: string): string {
  return `${hubTabHref(ONBOARDING_HUB, 'recruits')}&application=${encodeURIComponent(applicationId)}`;
}

function longDate(value: unknown): string {
  if (!value) return '';
  const date = new Date(value as string);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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

function Contact({ application }: { application: ApplicationRecord }) {
  if (!application.phone && !application.email) return null;
  return (
    <div className={t.contact}>
      {application.phone ? (
        <a className={t.contactLink} href={telHref(application.phone)} aria-label={`Call ${application.name}`}>
          <Phone size={15} aria-hidden="true" />
          <span>{application.phone}</span>
        </a>
      ) : null}
      {application.email ? (
        <a className={t.contactLink} href={`mailto:${application.email}`} aria-label={`Email ${application.name}`}>
          <Mail size={15} aria-hidden="true" />
          <span>{application.email}</span>
        </a>
      ) : null}
    </div>
  );
}

function ApplicantCard({ row, actions, archived }: { row: ApplicantRow; actions: ApplicantActions; archived: boolean }) {
  const { application } = row;
  const busy = actions.busyId === application.id;
  const headline = applicantHeadline(application);
  const archivedLine = [
    'Not a fit',
    longDate(application.notSelectedAt),
    application.notSelectedByName ? `by ${application.notSelectedByName}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <li className={t.card}>
      <button
        type="button"
        className={t.cardMain}
        onClick={() => actions.onOpen(application)}
        aria-label={`Open ${row.name}'s application`}
      >
        <strong className={t.name}>{row.name}</strong>
        {headline ? <span className={t.headline}>{headline}</span> : null}
        <span className={t.line}>{archived ? archivedLine : row.line}</span>
      </button>
      <Contact application={application} />
      <div className={t.cardActions}>
        {archived ? (
          actions.onRestore ? (
            <button
              type="button"
              className={`${s.btnSecondary} ${u.sm}`}
              disabled={busy}
              onClick={() => actions.onRestore?.(application)}
            >
              {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
              Restore
            </button>
          ) : null
        ) : (
          <>
            <Link href={inviteHref(application.id)} className={`${s.btnSecondary} ${u.sm} ${t.invite}`}>
              Invite
            </Link>
            {actions.onNotFit ? (
              <button
                type="button"
                className={`${s.btnSecondary} ${u.sm} ${u.quiet}`}
                disabled={busy}
                onClick={() => actions.onNotFit?.(application)}
              >
                {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
                Not a fit
              </button>
            ) : null}
          </>
        )}
      </div>
    </li>
  );
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
  return (
    <div className={s.panel}>
      <ul className={u.rows}>
        {rows.map((row) => (
          <ApplicantCard key={row.key} row={row} actions={actions} archived={archived} />
        ))}
      </ul>
    </div>
  );
}

/** The whole application: every answer they gave on /apply and where they came from. */
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
  const applied = longDate(application.createdAt);
  const ago = timeAgo(application.createdAt);
  const source = application.source;
  const facts: { label: string; value: ReactNode; wide?: boolean }[] = [
    { label: 'Wants to sell', value: interestLabels(application.interests) },
    { label: 'City', value: application.city },
    {
      label: 'Phone',
      value: application.phone ? (
        <a className={t.factLink} href={telHref(application.phone)}>
          {application.phone}
        </a>
      ) : (
        ''
      ),
    },
    { label: 'Applied', value: [applied, ago].filter(Boolean).join(' · ') },
    {
      label: 'Email',
      wide: true,
      value: application.email ? (
        <a className={t.factLink} href={`mailto:${application.email}`}>
          {application.email}
        </a>
      ) : (
        ''
      ),
    },
    { label: 'Referred by', value: application.referredBy ?? '' },
    { label: 'Found us', value: sourceLabel(source) },
    { label: 'First page', value: source?.landingPath ?? '' },
    { label: 'Campaign', value: [source?.utmCampaign, source?.utmMedium].filter(Boolean).join(' · ') },
  ].filter((fact) => fact.value);

  return (
    <AdminSheet
      title={application.name || 'Applicant'}
      onClose={onClose}
      footer={
        <>
          {archived ? (
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
                  className={s.btnSecondary}
                  disabled={busy}
                  onClick={() => actions.onNotFit?.(application)}
                >
                  Not a fit
                </button>
              ) : null}
              <Link href={inviteHref(application.id)} className={`${s.btnPrimary} ${u.primarySm}`}>
                Invite
              </Link>
            </>
          )}
        </>
      }
    >
      <div className={u.sheetPad}>
        {archived ? (
          <p className={u.hint}>
            Marked not a fit
            {application.notSelectedAt ? ` on ${longDate(application.notSelectedAt)}` : ''}
            {application.notSelectedByName ? ` by ${application.notSelectedByName}` : ''}.
          </p>
        ) : null}
        <dl className={u.facts}>
          {facts.map((fact) => (
            <div key={fact.label} className={fact.wide ? t.factWide : undefined}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
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
