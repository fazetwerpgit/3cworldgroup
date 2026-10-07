'use client';

import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AdminGate, AdminHubContext, AdminPageHead, AdminSkeletonRows, AdminTabs } from './AdminUi';
import { canOpenHubTab, hubRoles, hubTabHref, type HubConfig } from './adminHubs';
import u from './admin-ui.module.css';

interface AdminHubProps {
  hub: HubConfig;
  title: string;
  /** One plain sentence under the title saying what the page is for. */
  sub?: ReactNode;
  /** Renders each tab's page, keyed by tab key. */
  panels: Record<string, () => ReactNode>;
  /** Open items per tab, shown beside its label. undefined while they load. */
  counts?: Record<string, number | undefined>;
  /**
   * With no explicit ?tab=, open the first tab that has open items (else the
   * first tab), waiting up to COUNTS_WAIT_MS for `counts` to load. Decided once
   * per visit, so clearing the last item in a tab does not move the page under
   * the viewer.
   */
  landOnWork?: boolean;
}

/** How long a bare visit waits for tab counts before opening the first tab. */
const COUNTS_WAIT_MS = 1200;

/**
 * One admin page hosting several old pages as tabs (?tab= or ?type=). The
 * hosted page renders unchanged under its own gate; the hub shows only the tabs
 * the viewer can open and falls back to the first of them.
 */
function Hub({ hub, title, sub, panels, counts, landOnWork = false }: AdminHubProps) {
  const { isRole, hasPermission } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const asked = params.get(hub.param);
  const tabs = hub.tabs.filter((tab) => canOpenHubTab(tab, isRole, hasPermission));
  const askedTab = tabs.find((tab) => tab.key === asked);
  // An old tab key (a bookmark or an old notification link) opens its new tab,
  // keeping the rest of the query (?application= and the like).
  const aliasOf = asked ? hub.aliases?.[asked] : undefined;
  useEffect(() => {
    if (!aliasOf) return;
    const next = new URLSearchParams(params.toString());
    next.set(hub.param, aliasOf);
    router.replace(`${hub.href}?${next.toString()}`, { scroll: false });
  }, [aliasOf, params, hub, router]);

  const [landed, setLanded] = useState<string | null>(null);
  // The counts load every queue; past the wait, land without them rather than
  // hold the page on a skeleton.
  const [waitedOut, setWaitedOut] = useState(false);
  const waiting = landOnWork && !counts && !askedTab && !landed && !waitedOut;
  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setWaitedOut(true), COUNTS_WAIT_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  if (aliasOf) {
    // Wait for the redirect rather than land on another tab first.
  } else if (askedTab) {
    if (landed) setLanded(null);
  } else if (!landed && (!landOnWork || counts || waitedOut)) {
    const withWork = landOnWork ? tabs.find((tab) => (counts?.[tab.key] ?? 0) > 0) : undefined;
    const pick = withWork ?? tabs[0];
    if (pick) setLanded(pick.key);
  }
  const current = aliasOf ? undefined : (askedTab ?? tabs.find((tab) => tab.key === landed));

  return (
    <div className={u.page}>
      <AdminPageHead title={title} sub={sub} />
      {/* One tab needs no tab strip. */}
      {tabs.length > 1 && current ? (
        <AdminTabs
          label={`${title} sections`}
          value={current.key}
          options={tabs.map((tab) => ({ value: tab.key, label: tab.label, count: counts?.[tab.key] }))}
          onChange={(key) => router.replace(hubTabHref(hub, key), { scroll: false })}
        />
      ) : null}
      {current?.hint ? <p className={u.sub}>{current.hint}</p> : null}
      {current ? (
        <AdminHubContext.Provider value>{panels[current.key]()}</AdminHubContext.Provider>
      ) : (
        <AdminSkeletonRows rows={3} />
      )}
    </div>
  );
}

export function AdminHub(props: AdminHubProps) {
  return (
    <AdminGate roles={hubRoles(props.hub)}>
      <Suspense fallback={<AdminSkeletonRows rows={3} />}>
        <Hub {...props} />
      </Suspense>
    </AdminGate>
  );
}
