'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronLeft, CircleAlert, RotateCw, X } from 'lucide-react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import type { UserRole } from '@/types';
import s from '@/components/portal/rep/rep.module.css';
import p from '@/components/portal/rep/rep-page.module.css';
import u from './admin-ui.module.css';

/**
 * True inside a hub tab (People, Onboarding, Requests, Admin settings): the hub owns the page
 * title and tabs, so a hosted page's head keeps only its figure, sentence and
 * actions, and its title steps down to a hidden h2.
 */
export const AdminHubContext = createContext(false);

/** Page title block: Bebas title, live figure, one plain sentence, main action(s). */
export function AdminPageHead({
  title,
  meta,
  sub,
  actions,
  back,
}: {
  title: string;
  /** Live figure next to the title ("6 waiting"). */
  meta?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
}) {
  const inHub = useContext(AdminHubContext);
  if (inHub) {
    const heading = <h2 className={s.srOnly}>{title}</h2>;
    if (!meta && !sub && !actions) return heading;
    return (
      <header className={u.head}>
        <div className={u.headText}>
          {heading}
          {meta ? <span className={u.meta}>{meta}</span> : null}
          {sub ? <p className={u.sub}>{sub}</p> : null}
        </div>
        {actions ? <div className={u.headActions}>{actions}</div> : null}
      </header>
    );
  }

  return (
    <header className={u.head}>
      <div className={u.headText}>
        {back ? (
          <Link href={back.href} className={u.back}>
            <ChevronLeft size={20} aria-hidden="true" />
            {back.label}
          </Link>
        ) : null}
        <div className={u.titleRow}>
          <h1 className={u.title}>{title}</h1>
          {meta ? <span className={u.meta}>{meta}</span> : null}
        </div>
        {sub ? <p className={u.sub}>{sub}</p> : null}
      </div>
      {actions ? <div className={u.headActions}>{actions}</div> : null}
    </header>
  );
}

const NOTICE_ICON = { error: CircleAlert, ok: CheckCircle2, warn: AlertTriangle } as const;
const NOTICE_CLASS = { error: u.noticeError, ok: u.noticeOk, warn: u.noticeWarn } as const;

/** Inline message: an action's error or confirmation. */
export function AdminNotice({
  tone,
  children,
  onDismiss,
}: {
  tone: 'error' | 'ok' | 'warn';
  children: ReactNode;
  onDismiss?: () => void;
}) {
  const Icon = NOTICE_ICON[tone];
  return (
    <div className={`${u.notice} ${NOTICE_CLASS[tone]}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon size={18} aria-hidden="true" />
      <div className={u.noticeBody}>{children}</div>
      {onDismiss ? (
        <button type="button" className={u.noticeClose} aria-label="Dismiss" onClick={onDismiss}>
          <X size={16} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

/** A section that failed to load says so and offers a retry. Never zeros. */
export function AdminFailed({ what, onRetry, detail }: { what?: string; onRetry?: () => void; detail?: string }) {
  return (
    <div className={s.failed} role="alert">
      <span>
        Couldn&apos;t load{what ? ` ${what}` : ''}
        {detail ? <span className={u.panelMeta}> · {detail}</span> : null}
      </span>
      {onRetry ? (
        <button type="button" className={s.retry} onClick={onRetry}>
          <RotateCw size={14} aria-hidden="true" />
          Retry
        </button>
      ) : null}
    </div>
  );
}

/** Left-aligned text, no icon: the same empty state as the admin ops pages. */
export function AdminEmpty({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={u.empty}>
      <p className={u.emptyTitle}>{title}</p>
      {children ? <p className={u.emptyText}>{children}</p> : null}
      {action ? <div className={u.btnRow}>{action}</div> : null}
    </div>
  );
}

/** Row skeletons while a list loads. */
export function AdminSkeletonRows({ rows = 4, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-label={label}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className={u.skelRow} aria-hidden="true">
          <span className={u.skelLines}>
            <span className={s.skel} style={{ width: `${58 - (index % 3) * 9}%`, height: 14 }} />
            <span className={s.skel} style={{ width: `${34 + (index % 2) * 12}%`, height: 12 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export type Tone = 'lime' | 'blue' | 'amber' | 'red' | 'muted';
const TONE_CLASS: Record<Tone, string> = {
  lime: u.toneLime,
  blue: u.toneBlue,
  amber: u.toneAmber,
  red: u.toneRed,
  muted: u.toneMuted,
};

/** The dashboard's status language: coloured dot + word. */
export function StatusDot({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <span className={`${u.status} ${TONE_CLASS[tone]}`}>{children}</span>;
}

/**
 * The page's own role gate (unchanged gates, D fallback). RepShell has already
 * waited for auth, so the fallback only shows for a beat, and never flashes the
 * light spinner.
 */
export function AdminGate({ roles, children }: { roles?: UserRole[]; children: ReactNode }) {
  return (
    <ProtectedRoute roles={roles} fallback={<AdminSkeletonRows rows={3} />}>
      {children}
    </ProtectedRoute>
  );
}

export interface AdminTabOption {
  value: string;
  label: string;
  /** Open items in this tab, shown after its label. */
  count?: number;
}

/**
 * A hub's tab strip: the portal's canonical segmented tabs. Wider than the
 * screen (Requests has six) it scrolls sideways with a fade at each edge that
 * has more, and keeps the selected tab in view.
 */
export function AdminTabs({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: AdminTabOption[];
  onChange: (value: string) => void;
}) {
  const scroller = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    const start = el.scrollLeft > 2;
    const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setFade((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const selected = el.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (selected) {
      el.scrollTo({ left: selected.offsetLeft - (el.clientWidth - selected.offsetWidth) / 2, behavior: 'smooth' });
    }
    measure();
  }, [value, measure]);

  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  return (
    <div className={`${u.tabsWrap} ${fade.start ? u.tabsFadeStart : ''} ${fade.end ? u.tabsFadeEnd : ''}`}>
      <div ref={scroller} className={`${p.tabs} ${u.tabsScroll}`} role="group" aria-label={label} onScroll={measure}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`${p.tab} ${u.tabItem}`}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.label}
            {option.count != null ? (
              <span className={`${u.tabCount} ${option.count > 0 ? u.tabCountOpen : ''}`}>{option.count}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
