'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

/**
 * A direction-D confirm dialog for the sales page (delete, cancel, link an
 * order): bottom sheet on a phone, centred dialog on desktop, portaled to
 * <body> so iOS never clips it inside the scrolling <main>. No backdrop blur.
 */
export function SalesDialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <BodyLayer>
      <div
        className={s.backdrop}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section className={s.sheet} role="dialog" aria-modal="true" aria-labelledby={titleId}>
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id={titleId} className={s.sheetTitle}>
              {title}
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={onClose}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={s.sheetBody}>
            <div className={x.dialogBody}>
              {description ? <p>{description}</p> : null}
              {children}
              <div className={x.dialogFoot}>{footer}</div>
            </div>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
