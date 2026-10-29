'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { RECRUITER_GATE, type ApplicationRecord } from '@/types';
import { CheckDocumentsSheet } from './CheckDocumentsSheet';
import { personName, type ChecklistPerson } from './checklist';
import type { InviteView } from './Invites';
import { buildTodoSections, type Signup, type TodoRow, type TodoSections } from './todoRows';
import { TodoFold, TodoList } from './TodoList';
import { ApplicantList, ApplicantSheet, UndoToast, type ApplicantActions } from './Applicants';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';

// To do: everything in hiring that waits on you, in sections, most urgent
// first (sign-ups, documents, paperwork to activate, new applicants). Empty
// sections don't show. The waiting count is exactly what the Hiring badge
// counts (opsQueues): applicants older than 30 days fold into "Older
// applicants" and archived ("Not a fit") ones into "Archived", neither counted.
// The portal's alerts sit folded at the bottom and are not counted.

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
        // Stamped so the documents sheet knows when the signed file links run out.
        const signedAt = Date.now();
        setPeople(
          Array.isArray(json.people)
            ? (json.people as ChecklistPerson[]).map((person) => ({ ...person, filesSignedAt: signedAt }))
            : []
        );
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
  /** Every website application (any status): To do sorts them into sections. */
  applications: ApplicationRecord[];
}

/** One read of the recruiting API the Recruits tab uses. */
function useRecruiting() {
  const { user } = useAuth();
  const [data, setData] = useState<Loaded<Recruiting>>();

  const load = useCallback(async (background = false) => {
    if (!user) return;
    try {
      const response = await fetch('/api/portal/recruiting/invites', { headers: await authHeaders() });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || 'Failed to load recruiting');
      const invites: InviteView[] = Array.isArray(json.invites) ? json.invites : [];
      const applications: ApplicationRecord[] = Array.isArray(json.applications) ? json.applications : [];
      setData({
        ready: invites.filter((invite) => invite.status === 'submitted'),
        applications,
      });
    } catch {
      // A background refresh keeps what is on screen.
      if (!background) setData(null);
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

/** A section of To do: a heading with its count over a panel. Empty sections render nothing. */
function Section({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const id = useId();
  if (count === 0) return null;
  return (
    <section className={t.section} aria-labelledby={id}>
      <h3 id={id} className={u.sectionTitle}>
        {title}
        <small className={u.num}>{count}</small>
      </h3>
      <div className={s.panel}>{children}</div>
    </section>
  );
}

export interface TodoViewProps {
  sections: TodoSections;
  applicantActions: ApplicantActions;
  onCheck: (userId: string) => void;
  onActivate: (invite: InviteView) => void;
  activatingId: string | null;
}

/** The sections and folds of To do (no loading or failures): the page renders it, so does the design lab. */
export function TodoView({ sections, applicantActions, onCheck, onActivate, activatingId }: TodoViewProps) {
  const button = `${s.btnSecondary} ${u.sm}`;
  const action = (row: TodoRow): ReactNode => {
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
            onClick={() => onCheck(row.userId)}
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
            onClick={() => onActivate(row.invite)}
          >
            {busy ? <Loader2 size={16} className={u.spin} aria-hidden="true" /> : null}
            Activate
          </button>
        );
      }
      case 'applicant':
        return null;
    }
  };
  const list = (rows: TodoRow[]) => (
    <TodoList
      items={rows.map((row) => ({ key: row.key, name: row.name, detail: row.detail, when: row.when, action: action(row) }))}
    />
  );

  return (
    <>
      {sections.waiting === 0 ? <AdminEmpty title="Nothing waiting on you." /> : null}
      <Section title="Sign-ups to approve" count={sections.signups.length}>
        {list(sections.signups)}
      </Section>
      <Section title="Documents to check" count={sections.documents.length}>
        {list(sections.documents)}
      </Section>
      <Section title="Ready to activate" count={sections.activate.length}>
        {list(sections.activate)}
      </Section>
      <Section title="New applicants" count={sections.applicants.length}>
        <ApplicantList rows={sections.applicants} actions={applicantActions} />
      </Section>
      {sections.older.length > 0 ? (
        <TodoFold
          title="Older applicants"
          count={sections.older.length}
          hint="Applied more than 30 days ago. Not counted in To do."
        >
          <ApplicantList rows={sections.older} actions={applicantActions} />
        </TodoFold>
      ) : null}
      {sections.archived.length > 0 ? (
        <TodoFold title="Archived" count={sections.archived.length} hint="Marked not a fit. Restore puts them back.">
          <ApplicantList rows={sections.archived} actions={applicantActions} archived />
        </TodoFold>
      ) : null}
    </>
  );
}

type Override = Pick<ApplicationRecord, 'status' | 'notSelectedAt' | 'notSelectedByName'>;

export function Todo({ onChanged }: { onChanged?: () => void }) {
  const { user, isRole, hasPermission } = useAuth();
  // ?person=<uid> opens that person's Check sheet.
  const linkedPerson = useSearchParams().get('person');
  // Sign-ups: the badge's gate (admins approve sign-ups) on top of the People
  // page's, whose pending list this is.
  const everyoneTab = PEOPLE_HUB.tabs.find((tab) => tab.key === 'everyone');
  const canSeeSignups =
    isRole('admin') && (everyoneTab ? canOpenHubTab(everyoneTab, isRole, hasPermission) : false);
  const canSeeApplicants = isRole(...RECRUITING_ROLES);
  // "Not a fit" writes through the recruiting review gate: management or the recruiter grant.
  const canArchive = isRole('admin', 'operations', RECRUITER_GATE);
  // Portal alerts are back-office work, not recruiting: the recruiter grant
  // opens this tab but not the alerts API, so it never loads them.
  const canSeeAlerts = isRole('admin', 'operations');

  const signups = useSignups(canSeeSignups);
  const { people, load: loadChecklists } = useChecklists();
  const { data: recruitingData, load: loadRecruiting } = useRecruiting();
  // Back from the background (throttled): quiet reloads that keep the list on a failure.
  useRefreshOnResume(() => {
    void loadChecklists(true);
    void loadRecruiting(true);
  });
  const [openPerson, setOpenPerson] = useState<string | null>(null);
  const [openApplication, setOpenApplication] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [archivingId, setArchivingId] = useState<string | null>(null);
  // Not a fit / Restore show at once; the next reload from the API replaces these.
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [undo, setUndo] = useState<{ application: ApplicationRecord; text: string } | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'warn'; text: string } | null>(null);
  const [alerts, setAlerts] = useState<number | null>(0);

  const loading = signups === undefined || people === undefined || recruitingData === undefined;
  const applications = useMemo(
    () =>
      canSeeApplicants
        ? (recruitingData?.applications ?? []).map((application) =>
            overrides[application.id] ? { ...application, ...overrides[application.id] } : application
          )
        : [],
    [canSeeApplicants, recruitingData, overrides]
  );
  const sections = buildTodoSections({ signups, people, ready: recruitingData?.ready, applications });

  // A ?person= link opens their sheet once the checklists are in (once per link).
  const linkedHandled = useRef<string | null>(null);
  useEffect(() => {
    if (!linkedPerson || !people || linkedHandled.current === linkedPerson) return;
    linkedHandled.current = linkedPerson;
    if (people.some((person) => person.userId === linkedPerson)) setOpenPerson(linkedPerson);
    else setNotice({ tone: 'warn', text: 'That person has no onboarding checklist.' });
  }, [linkedPerson, people]);

  const sheetPerson = people?.find((person) => person.userId === openPerson) ?? null;
  const sheetApplication = applications.find((application) => application.id === openApplication) ?? null;

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

  /** Not a fit (archive) or Restore, shown at once and saved on the application. */
  const setArchived = async (application: ApplicationRecord, archive: boolean) => {
    setArchivingId(application.id);
    setNotice(null);
    try {
      const response = await fetch(`/api/portal/recruiting/applications/${encodeURIComponent(application.id)}`, {
        method: 'PATCH',
        headers: await authHeaders(true),
        body: JSON.stringify({ action: archive ? 'not_fit' : 'restore' }),
      });
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update');
      setOverrides((current) => ({
        ...current,
        [application.id]: archive
          ? {
              status: 'not_selected',
              notSelectedAt: new Date(),
              notSelectedByName: user?.displayName || null,
            }
          : { status: json.status === 'contacted' ? 'contacted' : 'applied', notSelectedAt: null, notSelectedByName: null },
      }));
      setOpenApplication(null);
      setUndo(archive ? { application, text: `${application.name || 'Applicant'} moved to Archived.` } : null);
      if (!archive) setNotice({ tone: 'ok', text: `${application.name || 'Applicant'} is restored.` });
      void loadRecruiting(true);
      onChanged?.();
    } catch (err) {
      setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
    } finally {
      setArchivingId(null);
    }
  };

  const applicantActions: ApplicantActions = {
    busyId: archivingId,
    onNotFit: canArchive ? (application) => void setArchived(application, true) : null,
    onRestore: canArchive ? (application) => void setArchived(application, false) : null,
    onOpen: (application) => setOpenApplication(application.id),
  };
  const dismissUndo = useCallback(() => setUndo(null), []);

  return (
    <AdminGate roles={['admin', 'operations', RECRUITER_GATE]}>
      <div className={u.page}>
        <AdminPageHead title="To do" />

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
        ) : (
          <TodoView
            sections={sections}
            applicantActions={applicantActions}
            onCheck={setOpenPerson}
            onActivate={(invite) => void activate(invite)}
            activatingId={activatingId}
          />
        )}

        {canSeeAlerts ? (
          <TodoFold title="Portal alerts" count={alerts} hidden={alerts === 0}>
            <ActionQueue onCount={setAlerts} />
          </TodoFold>
        ) : null}
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

      {sheetApplication ? (
        <ApplicantSheet
          key={sheetApplication.id}
          application={sheetApplication}
          actions={applicantActions}
          onClose={() => setOpenApplication(null)}
        />
      ) : null}

      {undo ? (
        <UndoToast
          text={undo.text}
          onDone={dismissUndo}
          onUndo={() => {
            const { application } = undo;
            setUndo(null);
            void setArchived(application, false);
          }}
        />
      ) : null}
    </AdminGate>
  );
}
