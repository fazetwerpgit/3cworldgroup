'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { BodyLayer } from '@/components/portal/rep/BodyLayer';
import { useSheetDismiss } from '@/hooks/useSheetDismiss';
import s from '@/components/portal/rep/rep.module.css';
import x from '@/components/portal/rep/rep-sales.module.css';

/**
 * A direction-D confirm dialog for the sales page (delete, cancel, link an
 * order): bottom sheet on a phone, centred dialog on desktop, portaled to
 * <body> so iOS never clips it inside the scrolling <main>. No backdrop blur.
 */
export function SalesDialog(props: {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
}) {
  // Mounted fresh on each open, so its slide-out state starts clean.
  if (!props.open) return null;
  return <OpenSalesDialog {...props} />;
}

function OpenSalesDialog({
  title,
  description,
  onClose,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement | null>(null);
  // A close the person asks for (Close, Escape, the backdrop, a drag down)
  // slides out first; the hook reads the latest onClose itself.
  const { close, closing, sheetRef, backdropRef } = useSheetDismiss<HTMLElement>(onClose);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <BodyLayer>
      <div
        ref={backdropRef}
        className={`${s.backdrop} ${s.backdropAbove}`}
        data-closing={closing || undefined}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section
          ref={sheetRef}
          className={s.sheet}
          data-closing={closing || undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id={titleId} className={s.sheetTitle}>
              {title}
            </h2>
            <button ref={closeRef} type="button" className={s.iconBtn} aria-label="Close" onClick={close}>
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
