'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CommandPalette } from '@/components/portal/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { RepBoot } from './RepBoot';
import { BodyLayer } from './BodyLayer';
import { AccentPicker, useRepAccent } from './repAccent';
import { RepTabBar } from './RepTabBar';
import { RepTopBar, type RepBackLink } from './RepTopBar';
import s from './rep.module.css';

export { RepBoot };

/** Lets a page swap the phone tab bar for its own bottom bar (Log Sale's submit bar). */
const TabBarHiddenContext = createContext<((hidden: boolean) => void) | null>(null);

/** Hide the phone tab bar while `hidden` is true and this component is mounted. */
export function useHideRepTabBar(hidden: boolean) {
  const setHidden = useContext(TabBarHiddenContext);
  useEffect(() => {
    if (!setHidden) return;
    setHidden(hidden);
    return () => setHidden(false);
  }, [hidden, setHidden]);
}

function RepChrome({ children, task, back }: { children: ReactNode; task?: string; back?: RepBackLink }) {
  const { user, isRole } = useAuth();
  usePresenceHeartbeat();
  const { channels } = useChatChannels();
  const { anyUnread } = useChatUnread(channels, user?.uid);
  const pendingSignupsCount = usePendingSignupsCount(isRole('admin'));
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const accent = useRepAccent(); // TEMP accent picker — remove after Jacob picks

  return (
    <TabBarHiddenContext.Provider value={setTabBarHidden}>
      <div className={s.root} data-shell="rep" data-accent={accent}>
        <RepTopBar chatUnread={anyUnread} pendingSignupsCount={pendingSignupsCount} task={task} back={back} />
        <main className={s.scroller} id="rep-main">
          <div className={s.main}>{children}</div>
        </main>
        {tabBarHidden ? null : <RepTabBar chatUnread={anyUnread} />}
        {/* TEMP accent picker — remove after Jacob picks */}
        {process.env.NODE_ENV !== 'production' ? (
          <BodyLayer>
            <AccentPicker />
          </BodyLayer>
        ) : null}
        {/* Keeps the portal-wide Ctrl/Cmd+K search working on D pages. */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
    </TabBarHiddenContext.Provider>
  );
}

/**
 * Direction D chrome for a rep-facing page: top bar, phone tab bar, no sidebar
 * rail. Mounted per page layout (dashboard first), so every page not yet ported
 * keeps the old PortalHeader + PortalSidebar.
 */
export function RepShell({
  children,
  permissions,
  task,
  back,
}: {
  children: ReactNode;
  permissions?: string[];
  /** A task page's title: on phones the top bar shows a back link and this instead of the brand. */
  task?: string;
  /** The task page's parent for that back link. Defaults to the dashboard. */
  back?: RepBackLink;
}) {
  return (
    <ProtectedRoute permissions={permissions} fallback={<RepBoot />}>
      <RepChrome task={task} back={back}>
        {children}
      </RepChrome>
    </ProtectedRoute>
  );
}
