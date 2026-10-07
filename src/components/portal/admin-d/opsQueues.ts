'use client';

import { useCallback, useEffect, useMemo, useSyncExternalStore } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase/config';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import {
  ONBOARDING_HUB,
  REQUEST_TABS,
  REQUESTS_HUB,
  canOpenHubTab,
  hubTabHref,
  type HubConfig,
} from './adminHubs';
import { fetchOpenRequests } from './openRequests';

// The admin work queues (what Ops Home used to list): Hiring's To do groups,
// the pipeline and the Requests types. One loader and one cache feed Home's
// Needs attention (the hiring rows), the Requests switcher counts and the nav
// badges, so a page and its badges never disagree and a page change does not
// refetch everything. Every To do card counts what that tab's header counts:
// things waiting on you (people to review, invites to activate, applicants to
// invite, sign-ups to give a role).

export interface QueueCard {
  key: string;
  label: string;
  href: string;
  /** The hub page the queue lives in (its nav badge). */
  hub: string;
  /** The tab inside that hub. */
  tab: string;
  count: number;
  oldestWaitMs: number | null;
  /** null when the queue has no per-item timestamps (pipeline, signups). */
  newToday: number | null;
  error: boolean;
  /**
   * false: listed on Home but not waiting on anyone (the pipeline), so it adds
   * to no nav badge, tab count or waiting total.
   */
  badge?: boolean;
}

type QueueFigures = Pick<QueueCard, 'count' | 'oldestWaitMs' | 'newToday'>;

interface QueueSource {
  key: string;
  label: string;
  hub: HubConfig;
  tab: string;
  badge?: boolean;
  /** `get` reads an API once per load, so two queues on one endpoint share the call. */
  load: (get: (url: string) => Promise<Record<string, unknown>>) => Promise<QueueFigures>;
}

const ONE_DAY_MS = 1000 * 60 * 60 * 24;
/** Cached queues older than this reload when a page that shows them mounts. */
const STALE_MS = 60_000;

async function authedJson(url: string): Promise<Record<string, unknown>> {
  const token = await auth?.currentUser?.getIdToken();
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token ?? ''}` } });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || 'failed');
  return json;
}

function figuresFrom(times: (string | null | undefined)[]): QueueFigures {
  const now = Date.now();
  const ages = times.flatMap((iso) => {
    const age = iso ? now - new Date(iso).getTime() : Number.NaN;
    return Number.isNaN(age) ? [] : [age];
  });
  return {
    count: times.length,
    oldestWaitMs: ages.length ? Math.max(...ages) : null,
    newToday: ages.filter((age) => age <= ONE_DAY_MS).length,
  };
}

const SOURCES: QueueSource[] = [
  {
    key: 'onboarding',
    label: 'Documents to check',
    hub: ONBOARDING_HUB,
    tab: 'todo',
    load: async (get) => {
      // Counts only: the summary read skips the review history and signed file URLs.
      const json = await get('/api/portal/onboarding/review?summary=1');
      const rows: { userId?: string; submittedAt?: string | null }[] = Array.isArray(json.submissions)
        ? json.submissions
        : [];
      // One per person (To do lists people), aged by their oldest waiting upload.
      const oldest = new Map<string, string | null>();
      for (const row of rows) {
        const key = row.userId ?? '';
        const time = row.submittedAt ?? null;
        const seen = oldest.get(key);
        if (!oldest.has(key) || (time && (!seen || time < seen))) oldest.set(key, time);
      }
      return figuresFrom([...oldest.values()]);
    },
  },
  {
    key: 'recruiting',
    label: 'Ready to activate',
    hub: ONBOARDING_HUB,
    tab: 'todo',
    load: async (get) => {
      const json = await get('/api/portal/recruiting/invites');
      const invites: { status?: string; submittedAt?: string | null }[] = Array.isArray(json.invites) ? json.invites : [];
      return figuresFrom(invites.filter((invite) => invite.status === 'submitted').map((invite) => invite.submittedAt));
    },
  },
  {
    key: 'applicants',
    label: 'New website applicants',
    hub: ONBOARDING_HUB,
    tab: 'todo',
    load: async (get) => {
      const json = await get('/api/portal/recruiting/invites');
      const applications: { status?: string; createdAt?: string | null }[] = Array.isArray(json.applications)
        ? json.applications
        : [];
      return figuresFrom(
        applications.filter((application) => application.status === 'applied').map((application) => application.createdAt)
      );
    },
  },
  {
    key: 'pipeline',
    label: 'Onboarding pipeline',
    hub: ONBOARDING_HUB,
    tab: 'pipeline',
    badge: false,
    load: async (get) => {
      const json = await get('/api/portal/pipeline');
      const counts = (json.counts ?? {}) as Record<string, number>;
      // No per-rep timestamp is fetched here, so age/newToday stay null rather than fabricated.
      const count = (counts.processing ?? 0) + (counts.need_logins ?? 0) + (counts.cleared_to_sell ?? 0);
      return { count, oldestWaitMs: null, newToday: null };
    },
  },
  ...REQUEST_TABS.map((tab) => ({
    key: tab.key,
    label: tab.label,
    hub: REQUESTS_HUB,
    tab: tab.key,
    // Same definition as the owner's Needs-attention count: status == 'new'.
    load: async () => figuresFrom((await fetchOpenRequests(tab.form)).map((row) => row.createdAt)),
  })),
];

// ---------------------------------------------------------------- cache

interface QueueSnapshot {
  /** Whose queues these are: uid plus the queue keys they can open. */
  viewer: string;
  cards: QueueCard[] | null;
  loading: boolean;
  refreshedAt: Date | null;
}

let snapshot: QueueSnapshot = { viewer: '', cards: null, loading: false, refreshedAt: null };
const listeners = new Set<() => void>();

function publish(next: QueueSnapshot) {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** viewer = "<uid>:<queue keys>"; the keys name the sources to load. */
async function loadQueues(viewer: string) {
  const keys = viewer.slice(viewer.indexOf(':') + 1).split(',');
  const sources = SOURCES.filter((source) => keys.includes(source.key));
  publish({ ...(snapshot.viewer === viewer ? snapshot : { cards: null, refreshedAt: null }), viewer, loading: true });
  const reads = new Map<string, Promise<Record<string, unknown>>>();
  const get = (url: string) => {
    let read = reads.get(url);
    if (!read) {
      read = authedJson(url);
      reads.set(url, read);
    }
    return read;
  };
  const cards = await Promise.all(
    sources.map(async (source): Promise<QueueCard> => {
      const base = {
        key: source.key,
        label: source.label,
        href: hubTabHref(source.hub, source.tab),
        hub: source.hub.href,
        tab: source.tab,
        ...(source.badge === false ? { badge: false } : {}),
      };
      try {
        return { ...base, ...(await source.load(get)), error: false };
      } catch {
        return { ...base, count: 0, oldestWaitMs: null, newToday: null, error: true };
      }
    })
  );
  // A newer viewer (sign-out, another account) owns the cache now.
  if (snapshot.viewer === viewer) publish({ viewer, cards, loading: false, refreshedAt: new Date() });
}

/** Loads unless this viewer's queues are loading or fresh. */
function ensureQueues(viewer: string) {
  const fresh =
    snapshot.viewer === viewer &&
    (snapshot.loading || (snapshot.refreshedAt && Date.now() - snapshot.refreshedAt.getTime() < STALE_MS));
  if (!fresh) void loadQueues(viewer);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const getSnapshot = () => snapshot;

export interface OpsQueues {
  /** Every queue the viewer can open, in menu order; null until the first load. */
  cards: QueueCard[] | null;
  loading: boolean;
  refreshedAt: Date | null;
  refresh: () => void;
}

/**
 * The work queues the viewer can open (each under its hub tab's gate), plus
 * sign-ups waiting for a role for admins. Loads on mount when the cache is stale.
 */
export function useOpsQueues(): OpsQueues {
  const { user, isRole, hasPermission } = useAuth();
  const keys = SOURCES.filter((source) => {
    const tab = source.hub.tabs.find((t) => t.key === source.tab);
    return tab ? canOpenHubTab(tab, isRole, hasPermission) : false;
  }).map((source) => source.key);
  const viewer = user && keys.length ? `${user.uid}:${keys.join(',')}` : '';
  const current = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const mine = current.viewer === viewer ? current : null;

  const refresh = useCallback(() => {
    if (viewer) void loadQueues(viewer);
  }, [viewer]);

  useEffect(() => {
    if (viewer) ensureQueues(viewer);
  }, [viewer]);

  // Same gate as before: approving a signup is an admin's job.
  const showSignups = isRole('admin');
  const signups = usePendingSignupsCount(showSignups);

  const loaded = mine?.cards ?? null;
  const cards = useMemo(() => {
    if (!loaded) return null;
    if (!showSignups) return loaded;
    const signupRow: QueueCard = {
      key: 'signups',
      label: 'Sign-ups waiting for a role',
      href: hubTabHref(ONBOARDING_HUB, 'todo'),
      hub: ONBOARDING_HUB.href,
      tab: 'todo',
      count: signups,
      oldestWaitMs: null,
      newToday: null,
      error: false,
    };
    return [...loaded, signupRow];
  }, [loaded, showSignups, signups]);

  return { cards, loading: mine?.loading ?? Boolean(viewer), refreshedAt: mine?.refreshedAt ?? null, refresh };
}

/** Things waiting on you per hub page, for the nav badges (Hiring, Requests). */
export function useAdminNavCounts(): Record<string, number> {
  const { cards } = useOpsQueues();
  return useMemo(() => {
    const counts: Record<string, number> = {};
    for (const card of cards ?? []) {
      if (card.badge !== false) counts[card.hub] = (counts[card.hub] ?? 0) + card.count;
    }
    return counts;
  }, [cards]);
}

/**
 * Things waiting on you per tab of one hub (Hiring's To do, the Requests
 * types), from the same cache as the nav badges, so the tabs add up to the
 * page's badge. undefined until the first load; a tab whose queues all failed
 * (or that waits on no one, like Pipeline) has no entry rather than a zero.
 */
export function useHubTabCounts(hub: HubConfig): Record<string, number> | undefined {
  const { cards } = useOpsQueues();
  return useMemo(() => {
    if (!cards) return undefined;
    const counts: Record<string, number> = {};
    for (const card of cards) {
      if (card.hub !== hub.href || card.error || card.badge === false) continue;
      counts[card.tab] = (counts[card.tab] ?? 0) + card.count;
    }
    return counts;
  }, [cards, hub.href]);
}
