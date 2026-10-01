'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { AdminGate, AdminHubContext, AdminPageHead, AdminSkeletonRows, AdminTabs } from './AdminUi';
import { canOpenHubTab, hubRoles, hubTabHref, type HubConfig } from './adminHubs';
import u from './admin-ui.module.css';

interface AdminHubProps {
  hub: HubConfig;
  title: string;
  /** Renders each tab's page, keyed by tab key. */
  panels: Record<string, () => ReactNode>;
  /** Open items per tab, shown beside its label. undefined while they load. */
  counts?: Record<string, number | undefined>;
  /**
   * With no explicit ?tab=, open the first tab that has open items (else the
   * first tab), waiting for `counts` to load. Decided once per visit, so
   * clearing the last item in a tab does not move the page under the viewer.
   */
  landOnWork?: boolean;
}

/**
 * One admin page hosting several old pages as tabs (?tab= or ?type=). The
 * hosted page renders unchanged under its own gate; the hub shows only the tabs
 * the viewer can open and falls back to the first of them.
 */
function Hub({ hub, title, panels, counts, landOnWork = false }: AdminHubProps) {
  const { isRole, hasPermission } = useAuth();
  const router = useRouter();
  const asked = useSearchParams().get(hub.param);
  const tabs = hub.tabs.filter((tab) => canOpenHubTab(tab, isRole, hasPermission));
  const askedTab = tabs.find((tab) => tab.key === asked);

  const [landed, setLanded] = useState<string | null>(null);
  if (askedTab) {
    if (landed) setLanded(null);
  } else if (!landed && (!landOnWork || counts)) {
    const withWork = landOnWork ? tabs.find((tab) => (counts?.[tab.key] ?? 0) > 0) : undefined;
    const pick = withWork ?? tabs[0];
    if (pick) setLanded(pick.key);
  }
  const current = askedTab ?? tabs.find((tab) => tab.key === landed);

  return (
    <div className={u.page}>
      <AdminPageHead title={title} />
      {tabs.length > 1 && current ? (
        <AdminTabs
          label={`${title} sections`}
          value={current.key}
          options={tabs.map((tab) => ({ value: tab.key, label: tab.label, count: counts?.[tab.key] }))}
          onChange={(key) => router.replace(hubTabHref(hub, key), { scroll: false })}
        />
      ) : null}
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
