'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AuthSubjectProvider, useAuth } from '@/contexts/AuthContext';
import { getIdToken } from '@/lib/firebase/getIdToken';
import type { ViewAsRep } from '@/lib/auth/viewAsHeader';
import { clearViewAs, readViewAs, writeViewAs } from '@/lib/viewAs/storage';
import { installViewAsFetch } from '@/lib/viewAs/viewAsFetch';
import { isOwner, type FieldRole, type User } from '@/types';

// "View as rep" (owner only, read only). The owner picks a rep on People; the
// rep's Home, Sales, sale detail and Board then render as the rep sees them,
// with the rep's data, under a "Viewing as … · read only" banner. Everything
// else — chat, notifications, settings, admin — stays the owner's own.
//
//   ViewAsProvider (portal layout) holds WHO is being viewed (sessionStorage,
//     so a reload keeps it; Exit and sign-out clear it) and confirms the rep
//     with the server (GET /api/portal/view-as?uid=, owner only).
//   ViewAsScope (RepShell, on the in-scope pages only) swaps the auth user for
//     the rep (read permissions only) and tags the screens' GETs with
//     `x-view-as` so the server answers with the rep's data.

export type ViewAsStatus = 'off' | 'loading' | 'ready';

interface ViewAsContextValue {
  /** The real signed-in user is the owner and a rep is picked. */
  viewing: boolean;
  /** The picked rep (from storage until the server confirms it). */
  rep: ViewAsRep | null;
  /** 'ready' once the server confirmed the rep for this owner. */
  status: ViewAsStatus;
  start: (rep: ViewAsRep) => void;
  exit: () => void;
}

const OFF: ViewAsContextValue = {
  viewing: false,
  rep: null,
  status: 'off',
  start: () => {},
  exit: () => {},
};

const ViewAsContext = createContext<ViewAsContextValue>(OFF);

/** True inside a ViewAsScope that is showing a rep: no writes from here. */
const ReadOnlyContext = createContext(false);

/** The in-scope screens, as the owner sees them while viewing as a rep. */
export function isViewAsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  if (pathname === '/portal/dashboard' || pathname === '/portal/leaderboard' || pathname === '/portal/sales') {
    return true;
  }
  // One sale (/portal/sales/<id>), not Log sale (/new, /new/bulk) or edit.
  return /^\/portal\/sales\/(?!new$)[^/]+$/.test(pathname);
}

export function ViewAsProvider({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const owner = isOwner(user?.role);
  const [rep, setRep] = useState<ViewAsRep | null>(null);
  const [confirmedUid, setConfirmedUid] = useState<string | null>(null);

  // Restore after mount (sessionStorage does not exist on the server render).
  useEffect(() => {
    const stored = readViewAs();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time restore from storage
    if (stored) setRep(stored);
  }, []);

  // Signed out, or not the owner: there is no view session.
  useEffect(() => {
    if (loading) return;
    if (!user || !owner) {
      clearViewAs();
      // eslint-disable-next-line react-hooks/set-state-in-effect -- auth changed: drop the session
      setRep(null);
      setConfirmedUid(null);
    }
  }, [loading, owner, user]);

  const exit = useCallback(() => {
    clearViewAs();
    setRep(null);
    setConfirmedUid(null);
  }, []);

  const start = useCallback((next: ViewAsRep) => {
    writeViewAs(next);
    setConfirmedUid(null);
    setRep(next);
  }, []);

  // Confirm the rep with the server (owner only, active field rep). A refusal
  // ends the session; a network failure keeps it and tries again on the next
  // mount — the rep routes refuse a bad header on their own anyway.
  const repUid = rep?.uid ?? null;
  const active = !!user && owner && !!repUid;
  useEffect(() => {
    if (!active || !repUid || confirmedUid === repUid) return;
    let cancelled = false;
    void (async () => {
      try {
        const token = await getIdToken();
        const response = await fetch(`/api/portal/view-as?uid=${encodeURIComponent(repUid)}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        if (cancelled) return;
        if (response.status === 403 || response.status === 404) {
          exit();
          return;
        }
        const data = (await response.json().catch(() => null)) as { rep?: ViewAsRep } | null;
        if (cancelled || !response.ok || !data?.rep) return;
        writeViewAs(data.rep);
        setRep(data.rep);
        setConfirmedUid(data.rep.uid);
      } catch (error) {
        if (!cancelled) console.error('View as: could not confirm the rep', error);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, confirmedUid, exit, repUid]);

  const value = useMemo<ViewAsContextValue>(
    () =>
      active && rep
        ? { viewing: true, rep, status: confirmedUid === rep.uid ? 'ready' : 'loading', start, exit }
        : { ...OFF, start: owner ? start : OFF.start, exit },
    [active, confirmedUid, exit, owner, rep, start]
  );

  return <ViewAsContext.Provider value={value}>{children}</ViewAsContext.Provider>;
}

export function useViewAs(): ViewAsContextValue {
  return useContext(ViewAsContext);
}

/** True on a screen rendered as a rep for the owner: hide every write. */
export function useViewAsReadOnly(): boolean {
  return useContext(ReadOnlyContext);
}

/** The rep as an auth user: their uid, name and role. Never the owner's. */
export function subjectUser(rep: ViewAsRep): User {
  const epoch = new Date(0);
  return {
    uid: rep.uid,
    email: rep.email,
    displayName: rep.displayName,
    fieldRole: (rep.fieldRole || undefined) as FieldRole | undefined,
    isIBO: false,
    avatarUrl: rep.avatarUrl ?? undefined,
    status: 'active',
    hireDate: epoch,
    createdAt: epoch,
    updatedAt: epoch,
  };
}

function ScopedAsRep({ rep, children }: { rep: ViewAsRep; children: ReactNode }) {
  const user = useMemo(() => subjectUser(rep), [rep]);
  // Layout effect: installed before any child's passive effect fetches.
  useLayoutEffect(() => installViewAsFetch(rep.uid), [rep.uid]);
  return (
    <ReadOnlyContext.Provider value={true}>
      <AuthSubjectProvider user={user}>{children}</AuthSubjectProvider>
    </ReadOnlyContext.Provider>
  );
}

/**
 * Wraps an in-scope screen. Not viewing: the screen as it is. Viewing: the
 * rep's view of it once the server confirmed the rep (a skeleton until then,
 * so the owner's own screen never flashes and fires its reads).
 */
export function ViewAsScope({ children, loading }: { children: ReactNode; loading: ReactNode }) {
  const { viewing, rep, status } = useViewAs();
  if (!viewing || !rep) return <>{children}</>;
  if (status !== 'ready') return <>{loading}</>;
  return (
    <ScopedAsRep key={rep.uid} rep={rep}>
      {children}
    </ScopedAsRep>
  );
}
