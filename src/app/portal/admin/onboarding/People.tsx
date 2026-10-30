'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { downloadCsv, toCsv } from '@/lib/export/csv';
import {
  AdminFailed,
  AdminGate,
  AdminNotice,
  AdminPageHead,
  AdminSkeletonRows,
} from '@/components/portal/admin-d/AdminUi';
import { hubTabHref, ONBOARDING_HUB, RECRUITING_ROLES } from '@/components/portal/admin-d/adminHubs';
import u from '@/components/portal/admin-d/admin-ui.module.css';
import { RECRUITER_GATE, type ApplicationRecord, type PipelineRep } from '@/types';
import { useRefreshOnResume } from '@/hooks/useRefreshOnResume';
import { CheckDocumentsSheet } from './CheckDocumentsSheet';
import { personName, type ChecklistPerson } from './checklist';
import { UndoToast } from './Applicants';
import { authHeaders, InviteFormSheet, useInviteActions, type InviteView, type Notice } from './Invites';
import {
  inFilter,
  matchesPerson,
  mergePeople,
  parseFilter,
  PEOPLE_EXPORT_COLUMNS,
  peopleExportRow,
  personActions,
  rowAction,
  stageCounts,
  type PeopleCaps,
  type PeopleFilter,
  type Person,
  type PersonAction,
} from './peopleList';
import { PeopleView, PersonSheet } from './PeopleView';
import { ChannelsSheet, DecommissionSheet, useTeamActions } from './TeamActions';

// Hiring > People: one place per person, from website application to selling
// (see peopleList for how records join and where someone is). It runs every
// action the old Recruits and Pipeline tabs had, each through its old route
// and gate:
//   - field managers (L1/L2, IBO owners) see the recruiting API only: their
//     own invites and the website applications; they invite, resend, copy the
//     link and activate their own recruits;
//   - management and the recruiter grant also see the team (pipeline and
//     onboarding review APIs): paperwork, documents, channels, field training,
//     and Not a fit / Restore on applications;
//   - only management decommissions and reinstates.
// ?stage=<filter> picks the filter (old ?tab=pipeline links land on All);
// ?application=<id> opens Send an invite filled from that application.

/** undefined while loading, null when it failed. */
type Loaded<T> = T | null | undefined;

interface Recruiting {
  invites: InviteView[];
  applications: ApplicationRecord[];
}

interface Team {
  reps: PipelineRep[];
  checklists: ChecklistPerson[];
}

function useNumberedLoad<T>(enabled: boolean, read: () => Promise<T>) {
  const { user } = useAuth();
  const [data, setData] = useState<Loaded<T>>();
  // Loads are numbered as they start; an answer older than the one on screen is dropped.
  const started = useRef(0);
  const shown = useRef(0);

  const load = useCallback(
    async (background = false) => {
      if (!user || !enabled) return;
      const number = ++started.current;
      try {
        const value = await read();
        if (number < shown.current) return;
        shown.current = number;
        setData(value);
      } catch {
        // A background refresh keeps what is on screen.
        if (!background) setData(null);
      }
    },
    [user, enabled, read]
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- first load; state is set after the fetch answers
    void load();
  }, [load]);

  return { data: enabled ? data : null, load };
}

async function getJson(url: string) {
  const response = await fetch(url, { headers: await authHeaders() });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || `Failed to load ${url}`);
  return json;
}

/** Invites and website applications: the recruiting API every Hiring viewer can read. */
async function readRecruiting(): Promise<Recruiting> {
  const json = await getJson('/api/portal/recruiting/invites');
  return {
    invites: Array.isArray(json.invites) ? json.invites : [],
    applications: Array.isArray(json.applications) ? json.applications : [],
  };
}

/** Accounts and their checklists: management and the recruiter grant only (both routes check). */
async function readTeam(): Promise<Team> {
  const [pipeline, review] = await Promise.all([
    getJson('/api/portal/pipeline'),
    getJson('/api/portal/onboarding/review'),
  ]);
  // Stamped so the documents sheet knows when the signed file links run out.
  const signedAt = Date.now();
  return {
    reps: Array.isArray(pipeline.reps) ? pipeline.reps : [],
    checklists: Array.isArray(review.people)
      ? (review.people as ChecklistPerson[]).map((person) => ({ ...person, filesSignedAt: signedAt }))
      : [],
  };
}

function PeopleBody({ onChanged }: { onChanged?: () => void }) {
  const { isRole } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const askedStage = params.get('stage');
  const askedApplication = params.get('application');

  const caps: PeopleCaps = {
    canSeeTeam: isRole('admin', 'operations', RECRUITER_GATE),
    canArchive: isRole('admin', 'operations', RECRUITER_GATE),
    // Decommission and Reinstate switch an account off and on: user management,
    // which the recruiter grant does not carry (the route stays management only).
    canDecommission: isRole('admin', 'operations'),
  };

  const recruiting = useNumberedLoad(true, readRecruiting);
  const team = useNumberedLoad(caps.canSeeTeam, readTeam);
  const loadRecruiting = recruiting.load;
  const loadTeam = team.load;
  // "3 days ago" and the 14-day window are read against the time of the last load.
  const [now, setNow] = useState(() => Date.now());
  const reloadAll = useCallback(
    async (background = true) => {
      await Promise.all([loadRecruiting(background), loadTeam(background)]);
      setNow(Date.now());
    },
    [loadRecruiting, loadTeam]
  );
  useRefreshOnResume(() => void reloadAll(true));

  const loading = recruiting.data === undefined || (caps.canSeeTeam && team.data === undefined);
  const failed = recruiting.data === null;

  const people = useMemo(
    () =>
      recruiting.data
        ? mergePeople({
            applications: recruiting.data.applications,
            invites: recruiting.data.invites,
            reps: team.data?.reps ?? null,
            checklists: team.data?.checklists ?? null,
          }, now)
        : [],
    [recruiting.data, team.data, now]
  );

  const [filter, setFilter] = useState<PeopleFilter>(() => parseFilter(askedStage));
  useEffect(() => {
    if (askedStage) setFilter(parseFilter(askedStage));
  }, [askedStage]);
  const [query, setQuery] = useState('');
  const [manager, setManager] = useState('all');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [running, setRunning] = useState<{ key: string; action: PersonAction } | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [inviteFor, setInviteFor] = useState<{ applicationId: string | null } | null>(null);
  const [checkUser, setCheckUser] = useState<string | null>(null);
  const [channelsFor, setChannelsFor] = useState<PipelineRep | null>(null);
  const [decommissionFor, setDecommissionFor] = useState<PipelineRep | null>(null);
  const [undo, setUndo] = useState<{ application: ApplicationRecord; text: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const dismissUndo = useCallback(() => setUndo(null), []);

  const managers = useMemo(
    () =>
      caps.canSeeTeam
        ? Array.from(new Set(people.map((p) => p.rep?.managerName).filter((m): m is string => Boolean(m)))).sort()
        : [],
    [people, caps.canSeeTeam]
  );
  const byManager = useMemo(
    () => (managers.length > 1 && manager !== 'all' ? people.filter((p) => p.rep?.managerName === manager) : people),
    [people, managers.length, manager]
  );
  const counts = useMemo(() => stageCounts(byManager, now), [byManager, now]);
  // A search looks through everyone, whatever the filter (each row says where they are).
  const visible = useMemo(
    () => byManager.filter((person) => (query.trim() ? true : inFilter(person, filter, now)) && matchesPerson(person, query)),
    [byManager, filter, query, now]
  );

  const openPerson = people.find((person) => person.key === openKey) ?? null;
  // The open person moved on (their key changed) or is gone: close the sheet.
  useEffect(() => {
    if (openKey && !loading && !openPerson) setOpenKey(null);
  }, [openKey, openPerson, loading]);

  // ?application=<id> (an Invite link from To do or anywhere else): once the
  // applications are in, open Send an invite filled from it, then drop the param.
  useEffect(() => {
    if (!askedApplication || !recruiting.data) return;
    if (recruiting.data.applications.some((application) => application.id === askedApplication)) {
      setInviteFor({ applicationId: askedApplication });
    }
    router.replace(hubTabHref(ONBOARDING_HUB, 'people'), { scroll: false });
  }, [askedApplication, recruiting.data, router]);

  const afterChange = useCallback(async () => {
    await reloadAll(true);
    onChanged?.();
  }, [reloadAll, onChanged]);

  const invites = useInviteActions({ reload: () => reloadAll(true), onChanged, notify: setNotice });
  const teamActions = useTeamActions({ reload: () => reloadAll(true), onChanged, notify: setNotice });

  /** Not a fit (archive) or Restore, saved on the application, then the list reloads. */
  const setArchived = async (application: ApplicationRecord, archive: boolean) => {
    setNotice(null);
    const response = await fetch(`/api/portal/recruiting/applications/${encodeURIComponent(application.id)}`, {
      method: 'PATCH',
      headers: await authHeaders(true),
      body: JSON.stringify({ action: archive ? 'not_fit' : 'restore' }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof json.error === 'string' ? json.error : 'Failed to update');
    await afterChange();
    if (archive) setUndo({ application, text: `${application.name || 'Applicant'} marked not a fit.` });
    else setNotice({ tone: 'ok', text: `${application.name || 'Applicant'} is restored.` });
  };

  const onAction = async (person: Person, action: PersonAction, options?: { replaceOpenedLink?: boolean }) => {
    const { application, invite, rep } = person;
    switch (action) {
      case 'invite':
        setOpenKey(null);
        setInviteFor({ applicationId: application?.id ?? null });
        return;
      case 'review':
        if (!rep) return;
        setOpenKey(null);
        setCheckUser(rep.uid);
        return;
      case 'channels':
        if (!rep) return;
        setOpenKey(null);
        setChannelsFor(rep);
        return;
      case 'decommission':
        if (!rep) return;
        setOpenKey(null);
        setDecommissionFor(rep);
        return;
    }
    setRunning({ key: person.key, action });
    try {
      switch (action) {
        case 'notFit':
        case 'restore':
          if (!application) return;
          try {
            await setArchived(application, action === 'notFit');
            if (action === 'notFit') setOpenKey(null);
          } catch (err) {
            setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to update' });
          }
          return;
        case 'copyLink':
          if (invite) await invites.copyInviteLink(invite);
          return;
        case 'resend':
          if (invite) await invites.resendInvite(invite, options?.replaceOpenedLink ?? false);
          return;
        case 'activate':
          if (invite?.status === 'submitted') await invites.convertInvite(invite, 'approved');
          else if (rep) await teamActions.activateRep(rep);
          return;
        case 'reject':
          if (invite) await invites.convertInvite(invite, 'rejected');
          return;
        case 'fieldTrain':
          if (rep) await teamActions.requestFieldTraining(rep);
          return;
        case 'reinstate':
          if (rep) await teamActions.reinstate(rep);
          return;
      }
    } finally {
      setRunning(null);
    }
  };

  const pickFilter = (next: PeopleFilter) => {
    setFilter(next);
    setQuery('');
  };

  const exportVisible = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      await downloadCsv('people.csv', toCsv(PEOPLE_EXPORT_COLUMNS, visible.map(peopleExportRow)));
    } catch {
      setNotice({ tone: 'error', text: "Couldn't save the CSV. Try again." });
    } finally {
      setExporting(false);
    }
  };

  // The invite form offers applicants nobody has invited yet.
  const pickable = people.flatMap((person) =>
    person.stage === 'applied' && person.application && !person.invite ? [person.application] : []
  );
  const checkPerson = team.data?.checklists.find((person) => person.userId === checkUser) ?? null;
  const sheetBusy: PersonAction | null =
    invites.linkBusy?.action === 'copy'
      ? 'copyLink'
      : invites.linkBusy?.action === 'resend'
        ? 'resend'
        : running && running.key === openKey
          ? running.action
          : null;
  const sheetLink =
    openPerson?.invite && invites.shownLink?.id === openPerson.invite.id ? invites.shownLink.url : null;

  return (
    <div className={u.page}>
      <AdminPageHead title="People" />

      {notice && !openPerson ? (
        <AdminNotice tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </AdminNotice>
      ) : null}
      {caps.canSeeTeam && team.data === null && !failed ? (
        <AdminFailed what="the team" onRetry={() => void loadTeam()} />
      ) : null}

      <PeopleView
        people={visible}
        counts={loading || failed ? null : counts}
        filter={query.trim() ? 'all' : filter}
        onFilter={pickFilter}
        query={query}
        onQuery={setQuery}
        managers={managers}
        manager={manager}
        onManager={setManager}
        onSendInvite={() => setInviteFor({ applicationId: null })}
        onOpen={(person) => {
          setNotice(null);
          invites.setShownLink(null);
          setOpenKey(person.key);
        }}
        rowAction={(person) => rowAction(person, caps, now)}
        now={now}
        onAction={(person, action) => void onAction(person, action)}
        busyKey={running?.key ?? null}
        status={
          loading ? (
            <AdminSkeletonRows rows={5} label="Loading people" />
          ) : failed ? (
            <AdminFailed what="people" onRetry={() => void loadRecruiting()} />
          ) : undefined
        }
        onExport={() => void exportVisible()}
        exporting={exporting}
      />

      {openPerson ? (
        <PersonSheet
          key={openPerson.key}
          person={openPerson}
          actions={personActions(openPerson, caps, now)}
          now={now}
          onAction={(person, action, options) => void onAction(person, action, options)}
          onClose={() => {
            setOpenKey(null);
            setNotice(null);
          }}
          busy={sheetBusy}
          notice={notice}
          onDismissNotice={() => setNotice(null)}
          shownLink={sheetLink}
        />
      ) : null}

      {inviteFor && recruiting.data ? (
        <InviteFormSheet
          applications={recruiting.data.applications}
          pickable={pickable}
          applicationId={inviteFor.applicationId}
          onClose={() => setInviteFor(null)}
          onCreated={afterChange}
        />
      ) : null}

      {checkPerson ? (
        <CheckDocumentsSheet
          key={checkPerson.userId}
          person={checkPerson}
          onClose={() => setCheckUser(null)}
          onChanged={afterChange}
          onFinished={() => {
            setNotice({ tone: 'ok', text: `All of ${personName(checkPerson)}'s documents are checked.` });
            setCheckUser(null);
          }}
        />
      ) : null}

      {channelsFor ? (
        <ChannelsSheet key={channelsFor.uid} rep={channelsFor} onClose={() => setChannelsFor(null)} onChanged={() => reloadAll(true)} />
      ) : null}

      {decommissionFor ? (
        <DecommissionSheet
          key={decommissionFor.uid}
          rep={decommissionFor}
          onClose={() => setDecommissionFor(null)}
          onDone={async (message) => {
            setDecommissionFor(null);
            setNotice({ tone: 'ok', text: message });
            await reloadAll(true);
          }}
        />
      ) : null}

      {undo ? (
        <UndoToast
          text={undo.text}
          onDone={dismissUndo}
          onUndo={() => {
            const { application } = undo;
            setUndo(null);
            void setArchived(application, false).catch((err) =>
              setNotice({ tone: 'error', text: err instanceof Error ? err.message : 'Failed to update' })
            );
          }}
        />
      ) : null}
    </div>
  );
}

/** `onChanged` runs after each action that changes hiring, so the hub's tab counts follow. */
export function People({ onChanged }: { onChanged?: () => void }) {
  return (
    <AdminGate roles={RECRUITING_ROLES}>
      <PeopleBody onChanged={onChanged} />
    </AdminGate>
  );
}
