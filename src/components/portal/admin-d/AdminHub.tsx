'use client';

import { Suspense, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { Seg } from '@/components/portal/admin-ops/AdminKit';
import { AdminGate, AdminHubContext, AdminPageHead, AdminSkeletonRows } from './AdminUi';
import { canOpenHubTab, hubRoles, hubTabHref, type HubConfig } from './adminHubs';
import u from './admin-ui.module.css';

interface AdminHubProps {
  hub: HubConfig;
  title: string;
  /** Renders each tab's page, keyed by tab key. */
  panels: Record<string, () => ReactNode>;
  /** Open items per tab, shown beside its label. */
  counts?: Record<string, number | undefined>;
}

/**
 * One admin page hosting several old pages as tabs (?tab= or ?type=). The
 * hosted page renders unchanged under its own gate; the hub shows only the tabs
 * the viewer can open and falls back to the first of them.
 */
function Hub({ hub, title, panels, counts }: AdminHubProps) {
  const { isRole, hasPermission } = useAuth();
  const router = useRouter();
  const asked = useSearchParams().get(hub.param);
  const tabs = hub.tabs.filter((tab) => canOpenHubTab(tab, isRole, hasPermission));
  const current = tabs.find((tab) => tab.key === asked) ?? tabs[0];

  return (
    <div className={u.page}>
      <AdminPageHead title={title} />
      {tabs.length > 1 ? (
        <Seg
          label={`${title} sections`}
          scroll
          value={current.key}
          options={tabs.map((tab) => ({ value: tab.key, label: tab.label, count: counts?.[tab.key] }))}
          onChange={(key) => router.replace(hubTabHref(hub, key), { scroll: false })}
        />
      ) : null}
      {current ? (
        <AdminHubContext.Provider value>
          {panels[current.key]()}
        </AdminHubContext.Provider>
      ) : null}
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
