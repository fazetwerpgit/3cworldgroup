'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { usePathname } from 'next/navigation';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { CommandPalette } from '@/components/portal/CommandPalette';
import { useAuth } from '@/contexts/AuthContext';
import { useChatChannels } from '@/hooks/chat/useChatChannels';
import { useChatUnread } from '@/hooks/chat/useChatUnread';
import { SharedChatProvider } from '@/hooks/chat/sharedChat';
import { useAdminNavCounts } from '@/components/portal/admin-d/opsQueues';
import { usePresenceHeartbeat } from '@/hooks/usePresenceHeartbeat';
import { isViewAsPath, useViewAs, ViewAsScope } from '@/contexts/ViewAsContext';
import { ViewAsBanner } from '@/components/portal/viewAs/ViewAsBanner';
import { RepBoot } from './RepBoot';
import { RepTabBar } from './RepTabBar';
import { RepTopBar, type RepBackLink } from './RepTopBar';
import { PushNudge } from './PushNudge';
import { PullToRefresh } from './PullToRefresh';
import { isRepShellPath } from './repShellRoutes';
import { useIsNativeApp } from '@/lib/app/isNativeApp';
import s from './rep.module.css';

export { RepBoot };

// Layout effects warn on the server; these components only run them in the browser.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

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

/** What one page asks of the shared chrome: its task title and back link. */
export type RepShellConfig = { task?: string; back?: RepBackLink };

type Registration = RepShellConfig & { depth: number; order: number };

type RepShellRegistry = {
  register: (id: string, registration: Registration) => void;
  unregister: (id: string) => void;
};

/** Present inside RepShellHost's shell: a page's <RepShell> registers with it instead of mounting chrome. */
const RegistryContext = createContext<RepShellRegistry | null>(null);
/** How many <RepShell>s wrap this point (a layout's and its page's): the deepest one names the page. */
const DepthContext = createContext(0);

/** The registration that names the page: the deepest, then the latest. */
export function pickRepShellConfig(registrations: Iterable<Registration>): RepShellConfig {
  let best: Registration | null = null;
  for (const entry of registrations) {
    if (!best || entry.depth > best.depth || (entry.depth === best.depth && entry.order > best.order)) {
      best = entry;
    }
  }
  return best ? { task: best.task, back: best.back } : {};
}

function RepChrome({ children, task, back }: { children: ReactNode; task?: string; back?: RepBackLink }) {
  const { user } = useAuth();
  const pathname = usePathname();
  // The owner viewing as a rep (read only): no presence ping or push nudge
  // while the session is on, and the in-scope screens render as the rep.
  const { viewing } = useViewAs();
  // Inside the 3C iOS app there is nothing to install and the shell owns push.
  const inApp = useIsNativeApp();
  usePresenceHeartbeat({ enabled: !viewing });
  // One live channel list and read-receipt listener per session, shared with
  // the chat page (useSharedChatChannels) instead of a second pair there.
  const { channels, loading: channelsLoading, error: channelsError, retry: retryChannels } = useChatChannels();
  const { unreadByChannel, anyUnread, lastReadByChannel } = useChatUnread(channels, user?.uid);
  const sharedChat = useMemo(
    () => ({
      channels: { channels, loading: channelsLoading, error: channelsError, retry: retryChannels },
      unread: { unreadByChannel, anyUnread, lastReadByChannel },
    }),
    [anyUnread, channels, channelsError, channelsLoading, lastReadByChannel, retryChannels, unreadByChannel]
  );
  const navCounts = useAdminNavCounts();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [tabBarHidden, setTabBarHidden] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // Keyed on the path only: a same-page router.replace that changes the query
  // or hash (a filter, the Sales month) keeps the spot instead of jumping to the top.
  useMainScrollMemory(mainRef, pathname ?? '');

  return (
    <TabBarHiddenContext.Provider value={setTabBarHidden}>
      <SharedChatProvider value={sharedChat}>
      <div className={s.root} data-shell="rep">
        <RepTopBar chatUnread={anyUnread} navCounts={navCounts} task={task} back={back} />
        <ViewAsBanner />
        {/* Push not working on this device: a banner here, or a full-screen sheet for a required person. */}
        {viewing || inApp ? null : <PushNudge />}
        <main className={s.scroller} id="rep-main" ref={mainRef}>
          {/* The shell's own pull to refresh is off in the app: this one refetches the screen. */}
          {inApp ? <PullToRefresh scrollerRef={mainRef} contentRef={contentRef} pathname={pathname} /> : null}
          <div className={s.main} ref={contentRef}>
            {viewing && isViewAsPath(pathname) ? (
              <ViewAsScope loading={<ViewAsLoading />}>{children}</ViewAsScope>
            ) : (
              children
            )}
          </div>
        </main>
        {tabBarHidden ? null : <RepTabBar chatUnread={anyUnread} navCounts={navCounts} />}
        {/* Keeps the portal-wide Ctrl/Cmd+K search working on D pages. */}
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </div>
      </SharedChatProvider>
    </TabBarHiddenContext.Provider>
  );
}

/** How long a restored position keeps waiting for the page's content to grow tall enough. */
const RESTORE_WINDOW_MS = 1500;
/** A Back / Forward that doesn't change the page (same URL) must not leave the flag set for the next tap. */
const POP_SETTLE_MS = 1000;

/**
 * On phones <main> is the scroller and now outlives each page, so it keeps a
 * scroll position per path: a new page opens at the top (as a fresh shell
 * did), and Back / Forward returns to where that page was left. Desktop
 * scrolls the window, which the browser and router already handle; there
 * <main> does not scroll and these writes do nothing.
 */
export function useMainScrollMemory(mainRef: React.RefObject<HTMLElement | null>, pathname: string) {
  const positions = useRef(new Map<string, number>());
  const current = useRef(pathname);
  const popped = useRef(false);
  const cancelRestore = useRef<(() => void) | null>(null);

  useEffect(() => {
    let settle: ReturnType<typeof setTimeout> | undefined;
    const onPop = () => {
      popped.current = true;
      // The navigation it causes (if any) lands within a frame or two; after
      // that the flag must not carry over to the next ordinary tap.
      clearTimeout(settle);
      settle = setTimeout(() => {
        popped.current = false;
      }, POP_SETTLE_MS);
    };
    window.addEventListener('popstate', onPop);
    return () => {
      clearTimeout(settle);
      window.removeEventListener('popstate', onPop);
    };
  }, []);

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      positions.current.set(current.current, el.scrollTop);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [mainRef]);

  useEffect(() => () => cancelRestore.current?.(), []);

  useIsoLayoutEffect(() => {
    if (current.current === pathname) return;
    current.current = pathname;
    cancelRestore.current?.();
    cancelRestore.current = null;
    const el = mainRef.current;
    const target = popped.current ? (positions.current.get(pathname) ?? 0) : 0;
    popped.current = false;
    positions.current.set(pathname, target);
    if (!el) return;
    el.scrollTop = target;
    if (target <= 0 || typeof requestAnimationFrame === 'undefined') return;
    // The page may still be loading: keep trying until it is tall enough, the
    // window closes, or the person scrolls themselves.
    const started = Date.now();
    let frame = 0;
    const stop = () => {
      cancelAnimationFrame(frame);
      el.removeEventListener('touchstart', stop);
      el.removeEventListener('wheel', stop);
      el.removeEventListener('pointerdown', stop);
      if (cancelRestore.current === stop) cancelRestore.current = null;
    };
    const tick = () => {
      if (Math.abs(el.scrollTop - target) <= 1 || Date.now() - started > RESTORE_WINDOW_MS) {
        stop();
        return;
      }
      el.scrollTop = target;
      frame = requestAnimationFrame(tick);
    };
    el.addEventListener('touchstart', stop, { passive: true });
    el.addEventListener('wheel', stop, { passive: true });
    el.addEventListener('pointerdown', stop);
    cancelRestore.current = stop;
    frame = requestAnimationFrame(tick);
  }, [pathname, mainRef]);
}

/** Until the server confirms the rep: never the owner's own screen and its reads. */
function ViewAsLoading() {
  return (
    <div aria-busy="true" aria-label="Loading the rep's view">
      <span className={s.skel} style={{ display: 'block', height: 120, borderRadius: 14 }} />
    </div>
  );
}

function sameBack(a?: RepBackLink, b?: RepBackLink): boolean {
  return a === b || (!!a && !!b && a.href === b.href && a.label === b.label);
}

/** The one shell: chrome built from whatever the current page registered. */
function HostedChrome({ children }: { children: ReactNode }) {
  const [registrations, setRegistrations] = useState<ReadonlyMap<string, Registration>>(() => new Map());
  const register = useCallback((id: string, next: Registration) => {
    setRegistrations((prev) => {
      const had = prev.get(id);
      if (had && had.depth === next.depth && had.task === next.task && sameBack(had.back, next.back)) return prev;
      const map = new Map(prev);
      // Keep the first registration's order so a changed title does not reorder.
      map.set(id, had ? { ...next, order: had.order } : next);
      return map;
    });
  }, []);
  const unregister = useCallback((id: string) => {
    setRegistrations((prev) => {
      if (!prev.has(id)) return prev;
      const map = new Map(prev);
      map.delete(id);
      return map;
    });
  }, []);
  const registry = useMemo(() => ({ register, unregister }), [register, unregister]);
  const { task, back } = pickRepShellConfig(registrations.values());

  return (
    <RegistryContext.Provider value={registry}>
      <RepChrome task={task} back={back}>
        {children}
      </RepChrome>
    </RegistryContext.Provider>
  );
}

/**
 * Mounted once in the portal layout. On every rep-shell path (see
 * repShellRoutes) it renders the Direction D chrome and keeps it mounted
 * across navigation: bars, chat listeners, presence and the <main> scroller
 * live for the session instead of being rebuilt on each tab switch. Pages
 * still render <RepShell task back permissions>, which hands those props to
 * this shell. Every other portal path renders bare.
 */
export function RepShellHost({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!isRepShellPath(pathname)) return <>{children}</>;
  return (
    <ProtectedRoute fallback={<RepBoot />}>
      <HostedChrome>{children}</HostedChrome>
    </ProtectedRoute>
  );
}

let registrationOrder = 0;

/** A page's slot in the shared shell: registers its chrome props and applies its permission gate. */
function RepShellSlot({
  registry,
  children,
  permissions,
  task,
  back,
}: {
  registry: RepShellRegistry;
  children: ReactNode;
  permissions?: string[];
  task?: string;
  back?: RepBackLink;
}) {
  const id = useId();
  const depth = useContext(DepthContext) + 1;
  const [order] = useState(() => ++registrationOrder);
  const backHref = back?.href;
  const backLabel = back?.label;

  useIsoLayoutEffect(() => {
    registry.register(id, {
      depth,
      order,
      task,
      back: backHref !== undefined && backLabel !== undefined ? { href: backHref, label: backLabel } : undefined,
    });
  }, [registry, id, depth, order, task, backHref, backLabel]);

  useIsoLayoutEffect(() => () => registry.unregister(id), [registry, id]);

  return (
    <DepthContext.Provider value={depth}>
      <ProtectedRoute permissions={permissions} fallback={<RepBoot />}>
        {children}
      </ProtectedRoute>
    </DepthContext.Provider>
  );
}

/**
 * Direction D chrome for a rep-facing page: top bar, phone tab bar, no sidebar
 * rail. Inside RepShellHost (every rep path in the portal) this only registers
 * the page's task title, back link and permission gate with the one shared
 * shell. Rendered anywhere else it mounts the whole shell itself.
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
  const registry = useContext(RegistryContext);
  if (registry) {
    return (
      <RepShellSlot registry={registry} permissions={permissions} task={task} back={back}>
        {children}
      </RepShellSlot>
    );
  }
  return (
    <ProtectedRoute permissions={permissions} fallback={<RepBoot />}>
      <RepChrome task={task} back={back}>
        {children}
      </RepChrome>
    </ProtectedRoute>
  );
}
