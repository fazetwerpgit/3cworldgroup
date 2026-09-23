'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import u from './admin-ui.module.css';

/**
 * D dialog for admin pages: a bottom sheet on phones, a centred dialog on
 * desktop. Always portaled to <body> (position:fixed inside the phone scroller
 * breaks on iPhone). Escape and a backdrop tap close it; focus starts on Close.
 */
export function AdminSheet({
  title,
  description,
  onClose,
  children,
  footer,
  tone,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  /** Pinned action row under the scrolling body. */
  footer?: ReactNode;
  /** 'danger' draws a red rule under the title for destructive confirmations. */
  tone?: 'danger';
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={`${s.sheet} ${u.sheet}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={`${s.sheetHead} ${tone === 'danger' ? u.sheetHeadDanger : ''}`}>
            <h2 id={titleId} className={s.sheetTitle}>
              {title}
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={s.sheetBody}>
            {description ? <p className={u.sheetLead}>{description}</p> : null}
            {children}
          </div>
          {footer ? <div className={u.sheetFoot}>{footer}</div> : null}
        </section>
      </div>
    </BodyLayer>
  );
}
