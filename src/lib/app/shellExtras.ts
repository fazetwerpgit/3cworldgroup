import { useEffect, useState } from 'react';
import { isNativeApp } from './isNativeApp';
import { postToNative, type OwnerWidgetData, type RepWidgetData, type WidgetData } from './bridge';
import type { Section } from '@/hooks/useRepDashboard';
import type { MoneySummary } from '@/lib/owner/companySummary';
import type { MarketsSummary } from '@/lib/owner/markets';
import { estimateDollars } from '@/lib/pay/estimate';

// The web side of the shell extras (the app repo's docs/NATIVE-EXTRAS.md):
// splash `ready`, the icon `badge` and the home-screen `widgetData`. All three
// are fire-and-forget posts through postToNative, so outside the 3C iOS app
// every function here does nothing.

// ---- ready ----------------------------------------------------------------

let readySent = false;

/**
 * Tells the shell the first real screen is on glass, so it can drop the
 * splash. Once per page load; waits two animation frames so the screen has
 * committed and painted. A no-op on the web.
 */
export function signalAppReady(): void {
  if (readySent || !isNativeApp()) return;
  readySent = true;
  const raf =
    typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn: () => void) => setTimeout(fn, 16);
  raf(() => raf(() => postToNative({ type: 'ready' })));
}

/** Calls signalAppReady once `when` is true (the screen's real content has rendered). */
export function useAppReady(when: boolean): void {
  useEffect(() => {
    if (when) signalAppReady();
  }, [when]);
}

// ---- badge ----------------------------------------------------------------

let lastBadge: number | undefined;

/** Total for the icon badge: the number of unread chat channels. */
export function countUnread(unreadByChannel: Record<string, boolean>): number {
  return Object.values(unreadByChannel).filter(Boolean).length;
}

/** Sends the icon badge count when it differs from the last one sent this page load. */
export function sendNativeBadge(count: number): void {
  const value = Math.max(0, Math.floor(Number.isFinite(count) ? count : 0));
  if (value === lastBadge || !isNativeApp()) return;
  if (postToNative({ type: 'badge', count: value })) lastBadge = value;
}

// ---- widget ---------------------------------------------------------------

/** Identical numbers are re-sent after this long, so the widget's "Updated ... ago" stays honest. */
export const WIDGET_REFRESH_MS = 30 * 60_000;

let lastWidget: { key: string; at: number } | undefined;

/**
 * The widget's account tag: the first 16 hex chars of SHA-256(uid), via Web
 * Crypto. The shell clears the widget and badge when it changes, so one
 * person's numbers never show for the next one signed in on the device.
 */
export async function hashUid(uid: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(uid));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 16);
}

/** hashUid(uid) inside the app; null on the web, before it resolves, or with no uid. */
export function useUidHash(uid: string | null | undefined): string | null {
  const [hashed, setHashed] = useState<{ uid: string; hash: string } | null>(null);
  useEffect(() => {
    if (!uid || !isNativeApp() || typeof crypto === 'undefined' || !crypto.subtle) return;
    let live = true;
    hashUid(uid).then(
      (hash) => {
        if (live) setHashed({ uid, hash });
      },
      () => {}
    );
    return () => {
      live = false;
    };
  }, [uid]);
  return hashed && hashed.uid === uid ? hashed.hash : null;
}

export interface WidgetInput {
  /** hashUid of the signed-in person. */
  uidHash: string;
  /** PaySummary.estThisMonth: the dashboard's Est. pay this month. */
  estThisMonth: number | null;
  hasPlan: boolean;
  /** PaySummary.monthCount: the dashboard's "N sales this month". */
  monthCount: number;
  /** This week's standing, or null when unranked / not loaded. */
  standing: { rank: number; of: number } | null;
  now: Date;
}

/** The widget's rank comes from the week's leaderboard (useRepDashboard standing). */
export const WIDGET_RANK_PERIOD_LABEL = 'This week';

const periodFormat = new Intl.DateTimeFormat('en-US', { month: 'long', timeZone: 'America/Chicago' });

/**
 * The widget payload from the dashboard's own numbers. No pay date ever
 * (estimates only). No plan (management) sends estPayMtd null, which the
 * widget shows as "Not on a plan". A month netted below zero by chargebacks
 * sends the real (negative) estimate, as the dashboard shows it.
 */
export function buildWidgetData(input: WidgetInput): RepWidgetData {
  // Whole dollars, rounded down once like every est. pay figure (lib/pay/estimate).
  const pay = input.hasPlan && input.estThisMonth !== null ? estimateDollars(input.estThisMonth) : null;
  const ranked = input.standing && input.standing.rank >= 1 && input.standing.of >= input.standing.rank;
  return {
    uidHash: input.uidHash,
    estPayMtd: pay,
    periodLabel: periodFormat.format(input.now),
    rank: ranked ? input.standing!.rank : null,
    rankOf: ranked ? input.standing!.of : null,
    // The rank is this week's (the dashboard's standing), not the month's.
    rankPeriodLabel: WIDGET_RANK_PERIOD_LABEL,
    salesMtd: Math.max(0, Math.floor(input.monthCount)),
    updatedAt: input.now.toISOString(),
  };
}

export interface OwnerWidgetInput {
  uidHash: string;
  /** OwnerDashboard's money section: installs this month come from it. null: failed. */
  money: MoneySummary | null;
  /** OwnerDashboard's markets section: company sales and the top rep. null: failed. */
  markets: MarketsSummary | null;
  now: Date;
}

/**
 * The owners' widget payload, from the company numbers OwnerDashboard already
 * loaded (no extra queries). Counts and a short name only: no money amounts.
 */
export function buildOwnerWidgetData(input: OwnerWidgetInput): OwnerWidgetData {
  const top = input.markets?.topRep ?? null;
  return {
    kind: 'owner',
    uidHash: input.uidHash,
    periodLabel: periodFormat.format(input.now),
    companySalesMtd: input.markets ? input.markets.total : null,
    companyInstallsMtd: input.money ? input.money.month.current.installs : null,
    topRepName: top ? top.name : null,
    topRepSalesMtd: top ? top.sales : null,
    updatedAt: input.now.toISOString(),
  };
}

/**
 * Sends widget data when the numbers change (updatedAt aside), or when the
 * same numbers were last sent WIDGET_REFRESH_MS ago. null clears the widget.
 */
export function sendNativeWidgetData(data: WidgetData | null, nowMs: number = Date.now()): void {
  if (!isNativeApp()) return;
  const key = data ? JSON.stringify({ ...data, updatedAt: undefined }) : 'null';
  if (lastWidget && lastWidget.key === key && (data === null || nowMs - lastWidget.at < WIDGET_REFRESH_MS)) return;
  if (postToNative({ type: 'widgetData', data })) lastWidget = { key, at: nowMs };
}

/**
 * Offers `data` to sendNativeWidgetData on every new value (memoize it); the
 * sender drops repeats. null sends nothing (the screen is not ready yet).
 */
export function useNativeWidgetData(data: WidgetData | null): void {
  useEffect(() => {
    if (data) sendNativeWidgetData(data);
  }, [data]);
}

/**
 * OwnerDashboard's widget feed: the company numbers once both sections have
 * settled (a failed one sends null), offered again every WIDGET_REFRESH_MS so
 * a dashboard left open keeps the widget inside its 48h window. A no-op on
 * the web. OwnerDashboard renders for the owner role only.
 */
export function useOwnerWidgetData(
  uid: string | null | undefined,
  sections: { money: Section<MoneySummary>; markets: Section<MarketsSummary> }
): void {
  const uidHash = useUidHash(uid);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!uidHash) return;
    const timer = setInterval(() => setTick((n) => n + 1), WIDGET_REFRESH_MS);
    return () => clearInterval(timer);
  }, [uidHash]);
  const { money, markets } = sections;
  useEffect(() => {
    if (!uidHash || money.status === 'loading' || markets.status === 'loading') return;
    sendNativeWidgetData(
      buildOwnerWidgetData({
        uidHash,
        money: money.status === 'ready' ? money.data : null,
        markets: markets.status === 'ready' ? markets.data : null,
        now: new Date(),
      })
    );
  }, [uidHash, money, markets, tick]);
}

// ---- sign-out -------------------------------------------------------------

/** Signed out: clear the badge and the widget. */
export function clearNativeExtras(): void {
  sendNativeBadge(0);
  sendNativeWidgetData(null);
}

/** Test-only. */
export function __resetShellExtrasForTests(): void {
  readySent = false;
  lastBadge = undefined;
  lastWidget = undefined;
}
