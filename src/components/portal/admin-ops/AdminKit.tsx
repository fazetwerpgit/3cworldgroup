'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, Check, ChevronDown, RotateCw, Search, X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { AdminPageHead, StatusDot as AdminStatusDot } from '@/components/portal/admin-d/AdminUi';
import rep from '@/components/portal/rep/rep.module.css';
import s from './admin-ops.module.css';

/** Direction D building blocks shared by the admin ops pages (queues, channels, templates, options). */

export function cx(...names: Array<string | false | null | undefined>): string {
  return names.filter(Boolean).join(' ');
}

/** The admin page head (admin-d's): title, live count beside it, optional lede, actions. */
export function AdminHead({
  title,
  lede,
  count,
  countLabel,
  actions,
}: {
  title: string;
  lede?: string;
  /** Open items, channels… Omitted while loading. */
  count?: number | null;
  countLabel?: string;
  actions?: ReactNode;
}) {
  return (
    <AdminPageHead
      title={title}
      meta={
        count != null ? (
          <>
            <b>{count.toLocaleString('en-US')}</b>
            {countLabel ? <span> {countLabel}</span> : null}
          </>
        ) : null
      }
      sub={lede}
      actions={actions}
    />
  );
}

export function AdminSearch({
  value,
  onChange,
  placeholder,
  label,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  label: string;
}) {
  return (
    <label className={s.search}>
      <Search size={18} aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={label}
        enterKeyHint="search"
      />
    </label>
  );
}

export interface SegOption<T extends string> {
  value: T;
  label: string;
  count?: number;
}

export function Seg<T extends string>({
  options,
  value,
  onChange,
  label,
  wrap = false,
  scroll = false,
}: {
  options: SegOption<T>[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  wrap?: boolean;
  /** One sideways-scrolling row (filters with many options). */
  scroll?: boolean;
}) {
  return (
    <div className={cx(s.seg, wrap && s.segWrap, scroll && s.segScroll)} role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={s.segBtn}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
          {opt.count != null ? <span className={s.segCount}>{opt.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function AdminSelect({
  value,
  onChange,
  label,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <span className={s.selectWrap}>
      <select className={s.select} value={value} onChange={(e) => onChange(e.target.value)} aria-label={label}>
        {children}
      </select>
      <ChevronDown size={18} aria-hidden="true" />
    </span>
  );
}

export function Banner({ tone, children }: { tone: 'ok' | 'error'; children: ReactNode }) {
  return (
    <div className={cx(s.banner, tone === 'ok' ? s.bannerOk : s.bannerErr)} role={tone === 'error' ? 'alert' : 'status'}>
      {tone === 'ok' ? <Check size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

/** "Couldn't load · Retry": a failed load says so; it never shows an empty list or zeros. */
export function LoadFailed({ what, onRetry }: { what?: string; onRetry: () => void }) {
  return (
    <div className={rep.failed} role="alert">
      <span>Couldn&apos;t load{what ? ` ${what}` : ''}</span>
      <span aria-hidden="true">·</span>
      <button type="button" className={rep.retry} onClick={onRetry}>
        <RotateCw size={14} aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={s.skelRow}>
          <span className={rep.skel} style={{ width: `${46 - (i % 3) * 8}%`, height: 14 }} />
          <span className={rep.skel} style={{ width: `${70 - (i % 2) * 18}%`, height: 12 }} />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body?: string; action?: ReactNode }) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{title}</p>
      {body ? <p className={s.emptyBody}>{body}</p> : null}
      {action}
    </div>
  );
}

export function ConfirmStrip({
  label,
  sub,
  confirming,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}: {
  label: string;
  sub?: string;
  confirming: boolean;
  confirmLabel?: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className={s.confirm} role="alertdialog" aria-label={label}>
      <p className={s.confirmText}>
        {label}
        {sub ? <span className={s.confirmSub}>{sub}</span> : null}
      </p>
      <div className={s.confirmBtns}>
        <button type="button" className={s.btnGhost} onClick={onCancel} disabled={confirming}>
          Cancel
        </button>
        <button type="button" className={s.btnDanger} onClick={onConfirm} disabled={confirming}>
          {confirming ? 'Deleting…' : confirmLabel}
        </button>
      </div>
    </div>
  );
}

const STATUS_TONE = { new: 'amber', done: 'lime', muted: 'muted' } as const;

/** Amber waits on you, lime is done. Same dot as the rest of admin. */
export function StatusDot({ tone, children }: { tone: 'new' | 'done' | 'muted'; children: ReactNode }) {
  return <AdminStatusDot tone={STATUS_TONE[tone]}>{children}</AdminStatusDot>;
}

/** Bottom sheet on phones, centred dialog on desktop; portaled to <body> (iOS fixed-in-scroller bug). */
export function AdminSheet({
  kicker,
  title,
  labelId,
  onClose,
  children,
  footer,
}: {
  kicker?: string;
  title: string;
  labelId: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // Focus the close button once on open (not on every re-render of the page behind).
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  return (
    <BodyLayer>
      <div
        className={rep.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={rep.sheet} role="dialog" aria-modal="true" aria-labelledby={labelId}>
          <div className={rep.sheetHandle} aria-hidden="true" />
          <div className={rep.sheetHead}>
            <div className={s.sheetTitleWrap}>
              {kicker ? <span className={cx(rep.kicker, s.sheetKicker)}>{kicker}</span> : null}
              <h2 id={labelId} className={s.sheetTitle}>
                {title}
              </h2>
            </div>
            <button ref={closeRef} type="button" className={rep.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={rep.sheetBody}>{children}</div>
          {footer ? <div className={s.sheetFoot}>{footer}</div> : null}
        </section>
      </div>
    </BodyLayer>
  );
}
