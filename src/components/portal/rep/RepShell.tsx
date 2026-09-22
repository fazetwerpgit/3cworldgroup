'use client';

import { useState, type ReactNode } from 'react';
import Image from 'next/image';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CommandPalette } from '@/components/portal/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import { usePendingSignupsCount } from '@/hooks/admin/usePendingSignupsCount';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { RepTabBar } from './RepTabBar';
import { RepTopBar } from './RepTopBar';
import s from './rep.module.css';

/** Auth / first-paint placeholder on the D ground, so a load never flashes white. */
export function RepBoot() {
  return (
    <div className={s.boot} role="status" aria-label="Loading">
      <Image src="/logo.webp" alt="" width={550} height={516} sizes="40px" className={s.bootMark} priority />
    </div>
  );
}

function RepChrome({ children }: { children: ReactNode }) {
  const { user, isRole } = useAuth();
  usePresenceHeartbeat();
  const { channels } = useChatChannels();
  const { anyUnread } = useChatUnread(channels, user?.uid);
  const pendingSignupsCount = usePendingSignupsCount(isRole('admin'));
  const [paletteOpen, setPaletteOpen] = useState(false);

  return (
    <div className={s.root} data-shell="rep">
      <RepTopBar chatUnread={anyUnread} pendingSignupsCount={pendingSignupsCount} />
      <main className={s.scroller} id="rep-main">
        <div className={s.main}>{children}</div>
      </main>
      <RepTabBar chatUnread={anyUnread} />
      {/* Keeps the portal-wide Ctrl/Cmd+K search working on D pages. */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
    </div>
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
}: {
  children: ReactNode;
  permissions?: string[];
}) {
  return (
    <ProtectedRoute permissions={permissions} fallback={<RepBoot />}>
      <RepChrome>{children}</RepChrome>
    </ProtectedRoute>
  );
}
