'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, Search, UserPlus } from 'lucide-react';
import { AdminEmpty, AdminNotice } from '@/components/portal/admin-d/AdminUi';
import { AdminSheet } from '@/components/portal/admin-d/AdminSheet';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { displayPhone, telHref } from '@/lib/phone';
import { RoleDisplayNames } from '@/types';
import { itemState, timeAgo } from './checklist';
import { opensLegacyLink, PEOPLE_STAGES, personLine, personTimeline, sheetActions, STAGE_FILTER_LABEL } from './peopleList';
import type { PeopleFilter, Person, PersonAction } from './peopleList';
import { ShownLink, type Notice } from './Invites';
import { TodoList } from './TodoList';
import t from './todo.module.css';
import pp from './people.module.css';

// Hiring > People, as it looks: Send an invite and search on top, the stage
// filter, then everyone as the shared To do row (name, where they are, how
// long, one action). Tapping a row opens the person sheet: how to reach them,
// what happened so far, their paperwork, and every action for where they are.
// No loading or failure states here: People renders this, so does the lab.

export const FILTER_ORDER: readonly PeopleFilter[] = ['current', 'all', ...PEOPLE_STAGES];
const FILTER_LABEL: Record<PeopleFilter, string> = { current: 'Now', all: 'All', ...STAGE_FILTER_LABEL };

const ACTION_LABEL: Record<PersonAction, string> = {
  invite: 'Invite',
  notFit: 'Not a fit',
  restore: 'Restore',
  copyLink: 'Copy link',
  resend: 'Resend',
  activate: 'Activate',
  reject: 'Reject',
  review: 'Check',
  channels: 'Channels',
  fieldTrain: 'Field train',
  decommission: 'Decommission',
  reinstate: 'Reinstate',
};

/** The sheet spells out what the row's one-word button means. */
const SHEET_LABEL: Partial<Record<PersonAction, string>> = {
  review: 'Review documents',
  resend: 'Resend invite',
  copyLink: 'Copy invite link',
  fieldTrain: 'Request field training',
};

const DANGER_ROWS: ReadonlySet<PersonAction> = new Set(['reject', 'decommission']);

/** "Oct 6", with the year once it isn't this year. */
function shortDate(ms: number | null, now: number): string {
  if (ms === null) return '';
  const date = new Date(ms);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export interface PeopleViewProps {
  people: Person[];
  counts: Record<PeopleFilter, number> | null;
  filter: PeopleFilter;
  onFilter: (filter: PeopleFilter) => void;
  query: string;
  onQuery: (query: string) => void;
  /** Managers to filter by; the select shows when there are two or more. */
  managers: string[];
  manager: string;
  onManager: (manager: string) => void;
  onSendInvite: () => void;
  onOpen: (person: Person) => void;
  /** The row's one action (rowAction), already resolved. */
  rowAction: (person: Person) => PersonAction | null;
  onAction: (person: Person, action: PersonAction) => void;
  /** The person whose row action is running (its button spins). */
  busyKey: string | null;
  /** The list itself while loading or failed (skeleton, retry). */
  status?: ReactNode;
  onExport?: () => void;
  exporting?: boolean;
  now: number;
}

export function PeopleView({
  people,
  counts,
  filter,
  onFilter,
  query,
  onQuery,
  managers,
  manager,
  onManager,
  onSendInvite,
  onOpen,
  rowAction,
  onAction,
  busyKey,
  status,
  onExport,
  exporting = false,
  now,
}: PeopleViewProps) {
  const button = `${s.btnSecondary} ${u.sm}`;
  const items = people.map((person) => {
    const action = rowAction(person);
    const busy = busyKey === person.key;
    return {
      key: person.key,
      name: person.name,
      detail: personLine(person),
      when: person.since !== null ? timeAgo(new Date(person.since), now) : '',
      open: { label: `Open ${person.name}`, onOpen: () => onOpen(person) },
      action: action ? (
        <button
          type="button"
          className={button}
          disabled={busy}
          aria-label={`${ACTION_LABEL[action]} ${person.name}`}
          onClick={() => onAction(person, action)}
        >
          {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
          {ACTION_LABEL[action]}
        </button>
      ) : null,
    };
  });

  return (
    <>
      <div className={pp.top}>
        <label className={`${u.search} ${pp.search}`}>
          <Search size={18} aria-hidden="true" />
          <input
            className={u.input}
            type="search"
            placeholder="Name, email or phone"
            aria-label="Search people"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </label>
        <button type="button" className={`${s.btnPrimary} ${u.primarySm} ${pp.send}`} onClick={onSendInvite}>
          <UserPlus size={18} aria-hidden="true" />
          <span className={pp.sendShort}>Invite</span>
          <span className={pp.sendLong}>Send an invite</span>
        </button>
      </div>

      <div className={u.chips} role="group" aria-label="Filter people">
        {FILTER_ORDER.map((key) => (
          <button key={key} type="button" className={u.chip} aria-pressed={filter === key} onClick={() => onFilter(key)}>
            {FILTER_LABEL[key]}
            {counts ? <span className={`${u.chipCount} ${u.num}`}>{counts[key]}</span> : null}
          </button>
        ))}
        {/* Managers sit with the other filters, as one more chip (team viewers with two or more). */}
        {managers.length > 1 ? (
          <span className={pp.managerChip} data-picked={manager !== 'all' || undefined}>
            <select value={manager} onChange={(e) => onManager(e.target.value)} aria-label="Manager">
              <option value="all">All managers</option>
              {managers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <ChevronDown size={16} aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <section className={s.panel} id="people" aria-label="People">
        {status ??
          (people.length === 0 ? (
            <AdminEmpty title={query.trim() ? 'No one matches' : 'No one here'} />
          ) : (
            <TodoList items={items} />
          ))}
      </section>

      {onExport && !status && people.length > 0 ? (
        <button
          type="button"
          className={pp.exportLink}
          disabled={exporting}
          aria-busy={exporting || undefined}
          onClick={onExport}
        >
          Export list
        </button>
      ) : null}
    </>
  );
}

export interface PersonSheetProps {
  person: Person;
  actions: PersonAction[];
  onAction: (person: Person, action: PersonAction, options?: { replaceOpenedLink?: boolean }) => void;
  onClose: () => void;
  /** Which action is running ('copy' / 'resend' for the link buttons, else any). */
  busy: PersonAction | null;
  notice: Notice | null;
  onDismissNotice: () => void;
  /** A link copied or re-sent by hand, shown so it can be selected. */
  shownLink: string | null;
  now: number;
}

/** Their details, what happened so far, their paperwork, and every action for where they are. */
export function PersonSheet({
  person,
  actions,
  onAction,
  onClose,
  busy,
  notice,
  onDismissNotice,
  shownLink,
  now,
}: PersonSheetProps) {
  const [confirm, setConfirm] = useState<'reject' | 'replace' | null>(null);
  const confirmRef = useRef<HTMLDivElement | null>(null);
  // A confirm opens beside the row or button that asked for it: bring it into view.
  useEffect(() => {
    if (confirm) confirmRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [confirm]);
  const { rep, invite, checklist } = person;

  const facts: { label: string; value: ReactNode }[] = [
    {
      label: 'Phone',
      value: person.phone ? (
        <a className={t.detailLink} href={telHref(person.phone)}>
          {displayPhone(person.phone)}
        </a>
      ) : null,
    },
    {
      label: 'Email',
      value: person.email ? (
        <a className={t.detailLink} href={`mailto:${person.email}`}>
          {person.email}
        </a>
      ) : null,
    },
    { label: 'City', value: person.city || null },
    {
      label: 'Role',
      value: rep
        ? `${RoleDisplayNames[rep.fieldRole]}${rep.isIBO ? ' · IBO' : ''}`
        : invite
          ? `${RoleDisplayNames[invite.intendedFieldRole]}${invite.isIBO ? ' · IBO' : ''}`
          : null,
    },
    { label: 'Manager', value: rep?.managerName ?? null },
    {
      label: 'Channels',
      value:
        rep && rep.stage !== 'processing'
          ? `${rep.channelsCleared} cleared${rep.channelsSubmitted ? `, ${rep.channelsSubmitted} pending` : ''}`
          : null,
    },
    {
      label: 'Signed in',
      value: rep && rep.stage !== 'processing' ? (rep.lastSignInAt ? shortDate(Date.parse(rep.lastSignInAt), now) : 'Never') : null,
    },
    {
      label: 'Sales',
      value:
        rep && (rep.approvedSales > 0 || rep.carrierOrders > 0)
          ? [
              `${rep.approvedSales} approved`,
              rep.carrierOrders > 0 ? `${rep.carrierOrders} on the carrier report` : '',
            ]
              .filter(Boolean)
              .join(' · ')
          : null,
    },
  ].filter((fact) => fact.value);

  const timeline = personTimeline(person, now);
  const items = checklist?.items ?? [];

  const run = (action: PersonAction) => {
    if (action === 'reject') return setConfirm('reject');
    if (action === 'resend' && invite && opensLegacyLink(invite)) return setConfirm('replace');
    onAction(person, action);
  };

  // One lead action for where they are (plus at most one beside it) at the
  // foot; everything else as quiet rows under More, the destructive ones last.
  const sheet = sheetActions(person, actions);
  const label = (action: PersonAction) => SHEET_LABEL[action] ?? ACTION_LABEL[action];
  const spinner = (action: PersonAction) =>
    busy === action ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null;
  const footButton = (action: PersonAction, lead: boolean) => (
    <button
      key={action}
      type="button"
      className={lead ? `${s.btnPrimary} ${u.primarySm}` : `${s.btnSecondary} ${u.sm}`}
      disabled={busy !== null}
      onClick={() => run(action)}
    >
      {spinner(action)}
      {label(action)}
    </button>
  );
  const row = (action: PersonAction) => (
    <li key={action}>
      <button
        type="button"
        className={pp.moreRow}
        data-danger={DANGER_ROWS.has(action) || undefined}
        disabled={busy !== null}
        onClick={() => run(action)}
      >
        <span>{label(action)}</span>
        {spinner(action)}
      </button>
    </li>
  );
  const footer =
    sheet.primary || sheet.secondary ? (
      <>
        {sheet.secondary ? footButton(sheet.secondary, false) : null}
        {sheet.primary ? footButton(sheet.primary, true) : null}
      </>
    ) : undefined;
  const confirmBox =
    confirm === 'reject' && invite ? (
      <div className={u.confirm} role="alert" ref={confirmRef}>
        <span>Reject {person.name}? This deactivates their account.</span>
        <span className={u.btnRow}>
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm} ${u.danger}`}
            disabled={busy !== null}
            onClick={() => {
              setConfirm(null);
              onAction(person, 'reject');
            }}
          >
            Yes, reject
          </button>
        </span>
      </div>
    ) : confirm === 'replace' && invite ? (
      <div className={u.confirm} role="alert" ref={confirmRef}>
        <span>
          {person.name} already opened their first link. A new link replaces it: if their onboarding page is still
          open, they&apos;ll need the new email. Files they uploaded are kept.
        </span>
        <span className={u.btnRow}>
          <button type="button" className={`${s.btnSecondary} ${u.sm}`} onClick={() => setConfirm(null)}>
            Cancel
          </button>
          <button
            type="button"
            className={`${s.btnSecondary} ${u.sm}`}
            onClick={() => {
              setConfirm(null);
              onAction(person, 'resend', { replaceOpenedLink: true });
            }}
          >
            Yes, send a new link
          </button>
        </span>
      </div>
    ) : null;

  return (
    <AdminSheet
      title={person.name}
      description={personLine(person)}
      onClose={onClose}
      footer={footer}
    >
      <div className={u.sheetPad}>
        {notice ? (
          <AdminNotice tone={notice.tone} onDismiss={onDismissNotice}>
            {notice.text}
          </AdminNotice>
        ) : null}
        {shownLink ? <ShownLink url={shownLink} /> : null}
        {facts.length ? (
          <dl className={t.details}>
            {facts.map((fact) => (
              <div key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {timeline.length ? (
          <section className={pp.block} aria-labelledby="person-history">
            <h3 id="person-history" className={pp.blockTitle}>
              So far
            </h3>
            <ol className={pp.timeline}>
              {timeline.map((entry) => (
                <li key={entry.key}>
                  <span className={`${pp.when} ${u.num}`}>{shortDate(entry.at, now)}</span>
                  <span>{entry.text}</span>
                </li>
              ))}
            </ol>
          </section>
        ) : null}

        {items.length ? (
          <section className={pp.block} aria-labelledby="person-paperwork">
            <h3 id="person-paperwork" className={pp.blockTitle}>
              Paperwork
              {rep?.onboarding ? (
                <small className={u.num}>
                  {rep.onboarding.approved} of {rep.onboarding.total}
                </small>
              ) : null}
            </h3>
            <dl className={pp.paperwork}>
              {items.map((item) => (
                <div key={item.id} data-status={item.status}>
                  <dt>
                    {item.itemLabel}
                    {item.status === 'rejected' && item.rejectionReason ? (
                      <span className={pp.itemNote}>{item.rejectionReason}</span>
                    ) : null}
                  </dt>
                  <dd className={u.num}>{itemState(item, now)}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}

        {sheet.activateNote ? <p className={u.hint}>{sheet.activateNote}</p> : null}

        {confirmBox}

        {sheet.more.length || sheet.danger.length ? (
          <section className={pp.block} aria-labelledby="person-more">
            <h3 id="person-more" className={pp.blockTitle}>
              More
            </h3>
            <ul className={pp.more}>
              {sheet.more.map(row)}
              {sheet.danger.map(row)}
            </ul>
          </section>
        ) : null}
      </div>
    </AdminSheet>
  );
}
