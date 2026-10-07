'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { collection, onSnapshot, query, Timestamp, where } from 'firebase/firestore';
import { Loader2 } from 'lucide-react';
import ActionQueue from '@/components/admin/ActionQueue';
import {
  AdminEmpty,
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
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
import { ONBOARDING_ITEMS } from '@/types/onboarding';
import type { ApplicationRecord } from '@/types';
import { CheckDocumentsSheet } from './CheckDocumentsSheet';
import { personName, type ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';
import { buildTodoRows, type Signup, type TodoRow } from './todoRows';

// To do: everything in hiring that waits on you, as one list, oldest first.
// One row is one thing with one button. The rows are exactly what the Hiring
// badge counts (opsQueues). The portal's alerts sit folded at the bottom and
// are not counted.

/** undefined while loading, null when it failed to load. */
type Loaded<T> = T | null | undefined;

// The onboarding and recruiting routes verify the caller from the ID token.
async function authHeaders(json = false): Promise<Record<string, string>> {
  const token = await getIdToken();
  return {
    ...(json ? { 'Content-Type': 'application/json' } : {}),
    Authorization: `Bearer ${token ?? ''}`,
  };
}

/**
 * Self-signups with no role yet: the same live query and filter as the
 * pending-signups badge (needs the admin/operations read rule, so only
 * subscribed for viewers who pass the badge's gate).
 */
function useSignups(enabled: boolean): Loaded<Signup[]> {
  const [signups, setSignups] = useState<Loaded<Signup[]>>();

  useEffect(() => {
    if (!enabled || !db) return;
    const pendingQuery = query(collection(db, 'users'), where('status', '==', 'pending'));
    return onSnapshot(
      pendingQuery,
      (snapshot) =>
        setSignups(
          snapshot.docs
            .filter((doc) => !doc.get('fieldRole') && !doc.get('suspectedBot'))
            .map((doc): Signup => {
              const created: unknown = doc.get('createdAt');
              return {
                uid: doc.id,
                name: String(doc.get('displayName') || doc.get('email') || 'Unnamed sign-up'),
                createdAt: created instanceof Timestamp ? created.toDate() : null,
              };
            })
        ),
      (err) => {
        console.error('Error listening to pending signups:', err);
        setSignups(null);
      }
    );
  }, [enabled]);

  if (!enabled) return [];
  // No database configured: say it failed rather than show nothing.
  return db ? signups : null;
}

/**
 * Everyone's checklist from the review API. `load(true)` refreshes after an
 * action and keeps the current list if it fails; it returns whether it worked.
 */
function useChecklists() {
  const { user } = useAuth();
  const [people, setPeople] = useState<Loaded<ChecklistPerson[]>>();

  const load = useCallback(
    async (background = false) => {
      if (!user) return false;
      try {
        const response = await fetch('/api/portal/onboarding/review', { headers: await authHeaders() });
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || 'Failed to load documents');
        setPeople(Array.isArray(json.people) ? json.people : []);
        return true;
      } catch {
        if (!background) setPeople(null);
        return false;
      }
    },
    [user]
  );

  useEffect(() => {
    void load();
  }, [load]);

  return { people, load };
}

interface Recruiting {
  /** Invites whose paperwork is in: waiting on Activate. */
  ready: InviteView[];
  /** Website applications not invited yet. */
  applied: ApplicationRecord[];
}

/** One read of the recruiting API the Recruits tab uses. */
function useRecruiting() {
  const { user } = useAuth();
  const [data, setData] = useState<Loaded<Recruiting>>();

  const load = useCallback(async () => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/recruiting/invites', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting');
      const invites: InviteView[] = Array.isArray(json.invites) ? json.invites : [];
      const applications: ApplicationRecord[] = Array.isArray(json.applications) ? json.applications : [];
      setData({
        ready: invites.filter((invite) => invite.status === 'submitted'),
        applied: applications.filter((application) => application.status === 'applied'),
      });
    } catch {
      setData(null);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, load };
}

function formatMissingItems(missing: unknown): string {
  return Array.isArray(missing) && missing.length > 0
    ? missing
        .map(String)
        .map((id) => ONBOARDING_ITEMS.find((item) => item.id === id)?.label ?? id)
        .join(', ')
    : '';
}

export function Todo({ onChanged }: { onChanged?: () => void }) {
  const { isRole, hasPermission } = useAuth();
  // ?person=<uid> opens that person's Check sheet.
  const linkedPerson = useSearchParams().get('person');
  // Sign-ups: the badge's gate (admins approve sign-ups) on top of the People
  // page's, whose pending list this is.
  const everyoneTab = PEOPLE_HUB.tabs.find((tab) => tab.key === 'everyone');
  const canSeeSignups =
    isRole('admin') && (everyoneTab ? canOpenHubTab(everyoneTab, isRole, hasPermission) : false);
  const canSeeApplicants = isRole(...RECRUITING_ROLES);

  const signups = useSignups(canSeeSignups);
  const { people, load: loadChecklists } = useChecklists();
  const { data: recruitingData, load: loadRecruiting } = useRecruiting();
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [alerts, setAlerts] = useState<number | null>(0);

  const loading = signups === undefined || people === undefined || recruitingData === undefined;
  const rows = buildTodoRows({
    signups,
    people,
    ready: recruitingData?.ready,
    applied: canSeeApplicants ? recruitingData?.applied : [],
  });

  // A ?person= link opens their sheet once the checklists are in (once per link).
  const linkedHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedPerson || !people || linkedHandled.current === linkedPerson) return;
    linkedHandled.current = linkedPerson;
    if (people.some((person) => person.userId === linkedPerson)) setOpenPerson(linkedPerson);
    else setNotice({ tone: 'warn', text: 'That person has no onboarding checklist.' });
  }, [linkedPerson, people]);

  const sheetPerson = people?.find((person) => person.userId === openPerson) ?? null;

  const refreshChecklists = useCallback(async () => {
    const ok = await loadChecklists(true);
    if (!ok) setNotice({ tone: 'error', text: "Couldn't refresh the list. Reload the page to try again." });
    onChanged?.();
  }, [loadChecklists, onChanged]);

  const finishPerson = useCallback(() => {
    if (sheetPerson) setNotice({ tone: 'ok', text: `All of ${personName(sheetPerson)}'s documents are checked.` });
    setOpenPerson(null);
  }, [sheetPerson]);

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
      await loadRecruiting();
      onChanged?.();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to activate' });
    } finally {
      setActivatingId(null);
    }
  };

  const button = `${s.btnSecondary} ${u.sm}`;
  const action = (row: TodoRow) => {
    switch (row.kind) {
      case 'signup':
        return (
          <Link href={PEOPLE_HUB.href} className={button} aria-label={`Assign a role to ${row.name}`}>
            Assign role
          </Link>
        );
      case 'documents':
        return (
          <button
            type="button"
            className={button}
            aria-label={`Check ${row.name}'s documents`}
            onClick={() => setOpenPerson(row.userId)}
          >
            Check
          </button>
        );
      case 'activate': {
        const busy = activatingId === row.invite.id;
        return (
          <button
            type="button"
            className={button}
            disabled={busy}
            aria-label={`Activate ${row.name}`}
            onClick={() => void activate(row.invite)}
          >
            {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
            Activate
          </button>
        );
      }
      case 'applicant':
        return (
          <Link
            href={`${hubTabHref(ONBOARDING_HUB, 'recruits')}&application=${encodeURIComponent(row.applicationId)}`}
            className={button}
            aria-label={`Invite ${row.name}`}
          >
            Invite
          </Link>
        );
    }
  };

  return (
    <AdminGate roles={['admin', 'operations']}>
      <div className={u.page}>
        <AdminPageHead
          title="To do"
          meta={
            loading || rows.length === 0 ? null : (
              <>
                <b>{rows.length}</b> {rows.length === 1 ? 'thing' : 'things'} waiting on you
              </>
            )
          }
        />

        {notice ? (
          <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
            {notice.text}
          </AdminNotice>
        ) : null}

        {signups === null ? <AdminFailed what="sign-ups" /> : null}
        {people === null ? <AdminFailed what="documents" onRetry={() => void loadChecklists()} /> : null}
        {recruitingData === null ? (
          <AdminFailed what="invites and applicants" onRetry={() => void loadRecruiting()} />
        ) : null}

        {loading ? (
          <AdminSkeletonRows rows={3} label="Loading what's waiting" />
        ) : rows.length === 0 ? (
          <AdminEmpty title="Nothing waiting on you." />
        ) : (
          <div className={s.panel}>
            <ul className={u.rows}>
              {rows.map((row) => (
                <li key={row.key} className={`${u.row} ${t.row}`}>
                  <span className={t.text}>
                    <strong className={t.name}>{row.name}</strong>
                    <span className={t.line}>{row.line}</span>
                  </span>
                  <span className={t.rowAction}>{action(row)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <details className={t.fold} hidden={alerts === 0}>
          <summary>Portal alerts{alerts ? ` (${alerts})` : ''}</summary>
          <ActionQueue onCount={setAlerts} />
        </details>
      </div>

      {sheetPerson ? (
        <CheckDocumentsSheet
          key={sheetPerson.userId}
          person={sheetPerson}
          onClose={() => setOpenPerson(null)}
          onChanged={refreshChecklists}
          onFinished={finishPerson}
        />
      ) : null}
    </AdminGate>
  );
}
