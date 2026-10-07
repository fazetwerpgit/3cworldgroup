'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { CheckCircle2, ChevronRight, Loader2, UserPlus } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
  StatusDot,
} from '@/components/portal/admin-d/AdminUi';
import {
  canOpenHubTab,
  hubTabHref,
  ONBOARDING_HUB,
  PEOPLE_HUB,
  RECRUITING_ROLES,
} from '@/components/portal/admin-d/adminHubs';
import s from '@/components/portal/rep/rep.module.css';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import t from './todo.module.css';
import { useAuth } from '@/contexts/AuthContext';
import { db } from '@/lib/firebase/config';
import { getIdToken } from '@/lib/firebase/getIdToken';
import { interestLabels } from '@/lib/forms/applicationInterests';
import { displayPhone, telHref } from '@/lib/phone';
import { RoleDisplayNames, type ApplicationRecord } from '@/types';
import { ONBOARDING_ITEMS } from '@/types/onboarding';
import type { InviteView } from './Invites';
import { CHECKLIST_STATUS_LEGEND, Review } from './Review';

// To do: everything in hiring that waits on the owner, one group per kind of
// work. Each group reads the same data as the screen that owns it (the pending
// sign-ups query, Review, the recruiting API) and hides when it has nothing.
// "N waiting on you" adds up exactly what the Hiring nav badge and this tab's
// count add up (opsQueues): sign-ups, people with documents to check, invites
// ready to activate, new applicants. The portal's alerts are shown as
// information and left out of that total.

/** undefined while loading, null when the group failed to load. */
type GroupCount = number | null | undefined;

const APPLICANTS_SHOWN = 10;

// The recruiting routes verify the caller from the ID token.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

function shortDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing
        .map(String)
        .map((id) => ONBOARDING_ITEMS.find((item) => item.id === id)?.label ?? id)
        .join(', ')
    : '';
}

function Group({
  id,
  title,
  count,
  explain,
  action,
  hidden,
  children,
}: {
  id: string;
  title: string;
  count?: GroupCount;
  explain: ReactNode;
  action?: ReactNode;
  hidden?: boolean;
  children: ReactNode;
}) {
  return (
    <section className={t.group} aria-labelledby={id} hidden={hidden}>
      <header className={`${u.sectionHead} ${t.groupHead}`}>
        <h2 id={id} className={u.sectionTitle}>
          {title}
          {typeof count === 'number' ? <small>{count}</small> : null}
        </h2>
        {action ? <span className={t.groupAction}>{action}</span> : null}
        <p className={u.sectionSub}>{explain}</p>
      </header>
      {children}
    </section>
  );
}

function PersonText({ name, sub, extra }: { name: string; sub: ReactNode; extra?: ReactNode }) {
  return (
    <span className={u.person}>
      <span className={u.personText}>
        <span className={u.personName}>
          <span>{name}</span>
        </span>
        <span className={u.personSub}>{sub}</span>
        {extra}
      </span>
    </span>
  );
}

interface Signup {
  uid: string;
  name: string;
  email: string;
  createdAt: Date | null;
}

/**
 * Self-signups with no role yet: the same live query and filter as the
 * pending-signups badge (needs the admin/operations read rule, so only
 * mounted for viewers who pass the badge's gate).
 */
function Signups({ onCount }: { onCount: (count: number | null) => void }) {
  const [signups, setSignups] = useState<Signup[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!db) {
      onCount(null);
      return;
    }
    const pendingQuery = query(collection(db, 'users'), where('status', '==', 'pending'));
    return onSnapshot(
      pendingQuery,
      (snapshot) => {
        const rows = snapshot.docs
          .filter((doc) => !doc.get('fieldRole') && !doc.get('suspectedBot'))
          .map((doc): Signup => {
            const created: unknown = doc.get('createdAt');
            const email = String(doc.get('email') ?? '');
            return {
              uid: doc.id,
              name: String(doc.get('displayName') || email || 'Unnamed sign-up'),
              email,
              createdAt: created instanceof Timestamp ? created.toDate() : null,
            };
          })
          // Longest wait first.
          .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0));
        setSignups(rows);
        setFailed(false);
        onCount(rows.length);
      },
      (err) => {
        console.error('Error listening to pending signups:', err);
        setFailed(true);
        onCount(null);
      }
    );
  }, [onCount]);

  if (failed || !db) return <AdminFailed what="sign-ups" />;
  if (!signups) return <AdminSkeletonRows rows={2} label="Loading sign-ups" />;
  return (
    <div className={s.panel}>
      <ul className={u.rows}>
        {signups.map((signup) => (
          <li key={signup.uid} className={`${u.row} ${t.row}`}>
            <PersonText
              name={signup.name}
              sub={[signup.email !== signup.name ? signup.email : '', signup.createdAt ? `signed up ${shortDate(signup.createdAt)}` : '']
                .filter(Boolean)
                .join(' · ')}
            />
            <span className={t.rowAction}>
              <Link href={PEOPLE_HUB.href} className={`${s.btnSecondary} ${u.sm}`}>
                Assign role
              </Link>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

interface Recruiting {
  /** Invites whose paperwork is in: waiting on Activate. */
  ready: InviteView[];
  /** Website applications not invited yet, newest first. */
  applied: ApplicationRecord[];
}

/** One read of the recruiting API the Recruits tab uses, for both of its groups. */
function useRecruiting() {
  const { user } = useAuth();
  const [data, setData] = useState<Recruiting | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/recruiting/invites', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting');
      const invites: InviteView[] = Array.isArray(json.invites) ? json.invites : [];
      const applications: ApplicationRecord[] = Array.isArray(json.applications) ? json.applications : [];
      setData({
        ready: invites
          .filter((invite) => invite.status === 'submitted')
          // Longest wait first.
          .sort((a, b) => new Date(a.submittedAt ?? 0).getTime() - new Date(b.submittedAt ?? 0).getTime()),
        applied: applications
          .filter((application) => application.status === 'applied')
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      });
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, failed, load };
}

export function Todo({ onChanged }: { onChanged?: () => void }) {
  const { isRole, hasPermission } = useAuth();
  // A ?person= link opens that person's checklist inside Documents to check.
  const linkedPerson = useSearchParams().get('person');
  // Sign-ups: the badge's gate (admins approve sign-ups) on top of the People
  // page's, whose pending list this is.
  const everyoneTab = PEOPLE_HUB.tabs.find((tab) => tab.key === 'everyone');
  const canSeeSignups =
    isRole('admin') && (everyoneTab ? canOpenHubTab(everyoneTab, isRole, hasPermission) : false);
  const canSeeApplicants = isRole(...RECRUITING_ROLES);

  const [signups, setSignups] = useState<GroupCount>();
  const [documents, setDocuments] = useState<GroupCount>();
  const [followUps, setFollowUps] = useState<GroupCount>();
  const recruiting = useRecruiting();
  // In place: the full checklist with its New / Handled / All filters.
  const [showAll, setShowAll] = useState(false);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const ready: GroupCount = recruiting.failed ? null : recruiting.data?.ready.length;
  const applicants: GroupCount = recruiting.failed ? null : recruiting.data?.applied.length;

  // What "waiting on you" adds up; the alerts below are information only.
  const counted = [
    ...(canSeeSignups ? [signups] : []),
    documents,
    ready,
    ...(canSeeApplicants ? [applicants] : []),
  ];
  const loading = [...counted, followUps].some((count) => count === undefined);
  const waitingTotal = counted.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  // A group shows once it has something or failed; failures say so.
  const shows = (count: GroupCount) => count === null || (count ?? 0) > 0;
  const showDocuments = showAll || shows(documents) || Boolean(linkedPerson);
  const nothingWaiting = !loading && counted.every((count) => count === 0) && !showAll;

  const activate = async (invite: InviteView) => {
    setActivatingId(invite.id);
    setNotice(null);
    try {
      const response = await fetch('/api/portal/recruiting/convert', {
        method: 'POST',
        headers: await authHeaders(true),
        body: JSON.stringify({ inviteId: invite.id, action: 'approved' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 409) {
          const missing = formatMissingItems(json.missing);
          throw new Error(
            missing
              ? `Can't activate ${invite.candidateName} yet. Missing: ${missing}`
              : `Can't activate ${invite.candidateName} yet. Required onboarding items are missing.`
          );
        }
        throw new Error(typeof json.error === 'string' ? json.error : 'Failed to activate');
      }
      setNotice({ tone: 'ok', text: `${invite.candidateName} is activated.` });
      await recruiting.load();
      onChanged?.();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to activate' });
    } finally {
      setActivatingId(null);
    }
  };

  const recruitingState = (what: string) =>
    recruiting.failed ? (
      <AdminFailed what={what} onRetry={() => void recruiting.load()} />
    ) : (
      <AdminSkeletonRows rows={2} label={`Loading ${what}`} />
    );

  const showAllButton = (
    <button type="button" className={s.textBtn} onClick={() => setShowAll(true)}>
      Show every new hire&apos;s checklist
    </button>
  );

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="To do"
          meta={
            loading ? null : (
              <>
                <b>{waitingTotal}</b> waiting on you
              </>
            )
          }
        />

        {notice ? (
          <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
          </AdminNotice>
        ) : null}

        {loading ? <AdminSkeletonRows rows={3} label="Loading what's waiting" /> : null}

        {canSeeSignups ? (
          <Group
            id="todo-signups"
            title="Sign-ups waiting for a role"
            count={signups}
            explain="They made an account with a team code. Give them a role so they can start."
            hidden={!shows(signups)}
          >
            <Signups onCount={setSignups} />
          </Group>
        ) : null}

        <Group
          id="todo-documents"
          title={showAll ? "Every new hire's checklist" : 'Documents to check'}
          count={showAll ? undefined : documents}
          explain={
            showAll
              ? 'Everyone going through onboarding and where each one is. Tap a person to see their list.'
              : 'New hires uploaded these. Approve them, or ask them to fix something. The number is people.'
          }
          action={
            showAll ? (
              <button type="button" className={s.textBtn} onClick={() => setShowAll(false)}>
                Show only what needs checking
              </button>
            ) : (
              showAllButton
            )
          }
          hidden={!showDocuments}
        >
          <details className={t.legend}>
            <summary>What the status words mean</summary>
            <dl className={t.legendList}>
              {CHECKLIST_STATUS_LEGEND.map((entry) => (
                <div key={entry.label} className={t.legendRow}>
                  <dt>
                    <StatusDot tone={entry.tone}>{entry.label}</StatusDot>
                  </dt>
                  <dd>{entry.meaning}</dd>
                </div>
              ))}
            </dl>
          </details>
          <Review focus={!showAll} embedded onChanged={onChanged} onWaiting={setDocuments} />
        </Group>

        <Group
          id="todo-activate"
          title="Ready to activate"
          count={ready}
          explain="They finished their paperwork. Activate them so they can start selling."
          hidden={!shows(ready)}
        >
          {recruiting.data && !recruiting.failed ? (
            <div className={s.panel}>
              <ul className={u.rows}>
                {recruiting.data.ready.map((invite) => {
                  const busy = activatingId === invite.id;
                  return (
                    <li key={invite.id} className={`${u.row} ${t.row}`}>
                      <PersonText
                        name={invite.candidateName}
                        sub={[
                          RoleDisplayNames[invite.intendedFieldRole],
                          invite.isIBO ? 'IBO' : '',
                          invite.submittedAt ? `finished ${shortDate(invite.submittedAt)}` : '',
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      />
                      <span className={t.rowAction}>
                        <button
                          type="button"
                          className={`${s.btnSecondary} ${u.sm}`}
                          disabled={busy}
                          aria-label={`Activate ${invite.candidateName}`}
                          onClick={() => void activate(invite)}
                        >
                          {busy ? (
                            <Loader2 size={16} className={u.spin} aria-hidden="true" />
                          ) : (
                            <CheckCircle2 size={16} aria-hidden="true" />
                          )}
                          Activate
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            recruitingState('invites')
          )}
        </Group>

        {canSeeApplicants ? (
          <Group
            id="todo-applicants"
            title="New website applicants"
            count={applicants}
            explain="Applied on the website and haven't been invited yet."
            action={
              <Link href={hubTabHref(ONBOARDING_HUB, 'recruits')} className={`${s.textBtn} ${t.textLink}`}>
                See all applicants
                <ChevronRight size={16} aria-hidden="true" />
              </Link>
            }
            hidden={!shows(applicants)}
          >
            {recruiting.data && !recruiting.failed ? (
              <div className={s.panel}>
                <ul className={u.rows}>
                  {recruiting.data.applied.slice(0, APPLICANTS_SHOWN).map((application) => {
                    const interests = interestLabels(application.interests);
                    return (
                      <li key={application.id} className={`${u.row} ${t.row}`}>
                        <PersonText
                          name={application.name}
                          sub={
                            <>
                              {application.city ? `${application.city} · ` : ''}
                              <a className={`${u.num} ${t.phone}`} href={telHref(application.phone)}>
                                {displayPhone(application.phone)}
                              </a>
                              {application.createdAt ? ` · applied ${shortDate(application.createdAt)}` : ''}
                            </>
                          }
                          extra={interests ? <span className={u.personSub}>Interested in {interests}</span> : null}
                        />
                        <span className={t.rowAction}>
                          <Link
                            href={`${hubTabHref(ONBOARDING_HUB, 'recruits')}&application=${encodeURIComponent(application.id)}`}
                            className={`${s.btnSecondary} ${u.sm}`}
                            aria-label={`Invite ${application.name}`}
                          >
                            <UserPlus size={16} aria-hidden="true" />
                            Invite
                          </Link>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              recruitingState('applicants')
            )}
          </Group>
        ) : null}

        {nothingWaiting ? (
          <AdminEmpty title="Nothing waiting on you." action={showAllButton}>
            New sign-ups, documents, finished paperwork and applicants show up here when they need you.
          </AdminEmpty>
        ) : !loading && !showDocuments ? (
          <p className={t.footer}>
            No documents to check. {showAllButton}
          </p>
        ) : null}

        <Group
          id="todo-alerts"
          title="For your information"
          explain="Alerts the portal raised about new hires. Not counted in what's waiting on you. Tap I've got it so others know someone is on it."
          hidden={!shows(followUps)}
        >
          <ActionQueue onCount={setFollowUps} />
        </Group>
      </div>
    </AdminGate>
  );
}
