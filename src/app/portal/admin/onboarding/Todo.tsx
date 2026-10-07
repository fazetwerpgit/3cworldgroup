'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { ChevronRight, UserPlus } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
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
import type { ApplicationRecord } from '@/types';
import { CHECKLIST_STATUS_LEGEND, Review } from './Review';

// To do: everything in hiring that waits on the owner, one group per kind of
// work. Each group reads the same data as the screen that owns it (the People
// pending list, Review, the recruiting API, the activation queue) under that
// screen's gate, and hides when it has nothing.

/** undefined while loading, null when the group failed to load. */
type GroupCount = number | null | undefined;

const APPLICANTS_SHOWN = 10;

function shortDate(value: Date | string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
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
  count: GroupCount;
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

interface Signup {
  uid: string;
  name: string;
  email: string;
  /** Already given a field role: accepting happens on their member record. */
  hasRole: boolean;
  createdAt: Date | null;
}

/**
 * Self-signups awaiting approval: the People page's pending list, read with the
 * same live query as the pending-signups badge (needs the admin/operations
 * read rule, so only mounted behind the Everyone tab's gate).
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
          .filter((doc) => !doc.get('suspectedBot'))
          .map((doc): Signup => {
            const created: unknown = doc.get('createdAt');
            const email = String(doc.get('email') ?? '');
            return {
              uid: doc.id,
              name: String(doc.get('displayName') || email || 'Unnamed sign-up'),
              email,
              hasRole: Boolean(doc.get('fieldRole')),
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
            <span className={u.person}>
              <span className={u.personText}>
                <span className={u.personName}>
                  <span>{signup.name}</span>
                </span>
                <span className={u.personSub}>
                  {[signup.email !== signup.name ? signup.email : '', signup.createdAt ? `signed up ${shortDate(signup.createdAt)}` : '']
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </span>
            <span className={t.rowAction}>
              {signup.hasRole ? (
                <Link href={`/portal/admin/users/${signup.uid}`} className={`${s.btnSecondary} ${u.sm}`}>
                  Open profile to accept
                </Link>
              ) : (
                <Link href={PEOPLE_HUB.href} className={`${s.btnSecondary} ${u.sm}`}>
                  Assign role
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Website applications not yet invited, from the recruiting API the Recruits tab reads. */
function Applicants({ onCount }: { onCount: (count: number | null) => void }) {
  const { user } = useAuth();
  const [applied, setApplied] = useState<ApplicationRecord[] | null>(null);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const token = await getIdToken();
      const response = await fetch('/api/portal/recruiting/invites', {
        headers: { Authorization: `Bearer ${token ?? ''}` },
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load applications');
      const rows = (Array.isArray(json.applications) ? (json.applications as ApplicationRecord[]) : [])
        .filter((application) => application.status === 'applied')
        // Newest first.
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setApplied(rows);
      onCount(rows.length);
    } catch {
      setFailed(true);
      onCount(null);
    }
  }, [user, onCount]);

  useEffect(() => {
    void load();
  }, [load]);

  if (failed) {
    return (
      <AdminFailed
        what="applicants"
        onRetry={() => {
          setFailed(false);
          void load();
        }}
      />
    );
  }
  if (!applied) return <AdminSkeletonRows rows={2} label="Loading applicants" />;
  return (
    <div className={s.panel}>
      <ul className={u.rows}>
        {applied.slice(0, APPLICANTS_SHOWN).map((application) => {
          const interests = interestLabels(application.interests);
          return (
            <li key={application.id} className={`${u.row} ${t.row}`}>
              <span className={u.person}>
                <span className={u.personText}>
                  <span className={u.personName}>
                    <span>{application.name}</span>
                  </span>
                  <span className={u.personSub}>
                    {application.city ? `${application.city} · ` : ''}
                    <a className={`${u.num} ${t.phone}`} href={telHref(application.phone)}>
                      {displayPhone(application.phone)}
                    </a>
                    {application.createdAt ? ` · applied ${shortDate(application.createdAt)}` : ''}
                  </span>
                  {interests ? <span className={u.personSub}>Interested in {interests}</span> : null}
                </span>
              </span>
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
  );
}

export function Todo({ onChanged }: { onChanged?: () => void }) {
  const { isRole, hasPermission } = useAuth();
  // A ?person= link opens that person's checklist inside Documents to check.
  const linkedPerson = useSearchParams().get('person');
  // Each group keeps the gate of the screen it comes from.
  const everyoneTab = PEOPLE_HUB.tabs.find((tab) => tab.key === 'everyone');
  const canSeeSignups = everyoneTab ? canOpenHubTab(everyoneTab, isRole, hasPermission) : false;
  const canSeeApplicants = isRole(...RECRUITING_ROLES);

  const [signups, setSignups] = useState<GroupCount>();
  const [documents, setDocuments] = useState<GroupCount>();
  const [applicants, setApplicants] = useState<GroupCount>();
  const [followUps, setFollowUps] = useState<GroupCount>();
  // In place: the full checklist with its New / Handled / All filters.
  const [showAll, setShowAll] = useState(false);

  const counts = [
    ...(canSeeSignups ? [signups] : []),
    documents,
    ...(canSeeApplicants ? [applicants] : []),
    followUps,
  ];
  const loading = counts.some((count) => count === undefined);
  const waitingTotal = counts.reduce<number>((sum, count) => sum + (count ?? 0), 0);
  // A group shows once it has something or failed; failures say so with a retry.
  const shows = (count: GroupCount) => count === null || (count ?? 0) > 0;
  const showDocuments = showAll || shows(documents) || Boolean(linkedPerson);
  const nothingWaiting = !loading && counts.every((count) => count === 0) && !showAll;

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
              : 'New hires uploaded or signed these. Approve them, or ask them to fix something.'
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
            <Applicants onCount={setApplicants} />
          </Group>
        ) : null}

        <Group
          id="todo-follow-ups"
          title="New hires to follow up on"
          count={followUps}
          explain="The portal flagged these: someone is ready to activate, stuck, or needs a manager. Tap I've got it so others know you're on it."
          hidden={!shows(followUps)}
        >
          <ActionQueue onCount={setFollowUps} />
        </Group>

        {nothingWaiting ? (
          <AdminEmpty title="Nothing waiting on you." action={showAllButton}>
            New sign-ups, documents and applicants show up here when they need you.
          </AdminEmpty>
        ) : !loading && !showDocuments ? (
          <p className={t.footer}>
            No documents to check. {showAllButton}
          </p>
        ) : null}
      </div>
    </AdminGate>
  );
}
