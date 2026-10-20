'use client';

import { useCallback, useEffect, useRef, type MouseEvent } from 'react';
import Link from 'next/link';
import { ChevronRight, Plus, Sun, X } from 'lucide-react';
import { useSheetDismiss } from '@/hooks/useSheetDismiss';
import { BodyLayer } from './BodyLayer';
import { LOG_SALE_HREF, SOLAR_DECK_HREF } from './repNav';
import s from './rep.module.css';
import c from './log-chooser.module.css';

/**
 * A dual (fiber + solar) rep's center +: log a fiber sale, or open the solar
 * deck. Bottom sheet on phone, portaled to <body> like the other rep sheets.
 * Focus starts on the first choice; Escape, the backdrop, the close button or
 * a drag down close it.
 */
export function LogChooserSheet({
  onClose,
  inApp = false,
  onFiberClick,
}: {
  onClose: () => void;
  /** Inside the 3C app the fiber choice replaces the entry, as the Log sale tab does. */
  inApp?: boolean;
  /** The tab bar's own tap handling for Log sale (haptic, tab restore). */
  onFiberClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const firstRef = useRef<HTMLAnchorElement | null>(null);
  const { close, closing, sheetRef, backdropRef } = useSheetDismiss<HTMLElement>(onClose);
  const boxRef = useRef<HTMLElement | null>(null);
  const setSheet = useCallback(
    (el: HTMLElement | null) => {
      boxRef.current = el;
      sheetRef(el);
    },
    [sheetRef],
  );

  useEffect(() => {
    firstRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      // aria-modal: Tab cycles inside the sheet instead of reaching the page under it.
      if (event.key === 'Tab' && boxRef.current) {
        const items = [...boxRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled])')];
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (active === first || !boxRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (active === last || !boxRef.current.contains(active))) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [close]);

  return (
    <BodyLayer>
      <div
        ref={backdropRef}
        className={s.backdrop}
        data-closing={closing || undefined}
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
      >
        <section
          ref={setSheet}
          className={s.sheet}
          data-closing={closing || undefined}
          role="dialog"
          aria-modal="true"
          aria-labelledby="log-chooser-title"
        >
          <div className={s.sheetHandle} aria-hidden="true" />
          <div className={s.sheetHead}>
            <h2 id="log-chooser-title" className={s.sheetTitle}>
              Fiber or solar?
            </h2>
            <button type="button" className={s.iconBtn} aria-label="Close" onClick={close}>
              <X size={20} aria-hidden="true" />
            </button>
          </div>
          <div className={`${s.sheetBody} ${c.body}`}>
            <Link
              ref={firstRef}
              href={LOG_SALE_HREF}
              className={c.choice}
              replace={inApp}
              onClick={(event) => {
                onFiberClick?.(event);
                onClose();
              }}
            >
              <span className={c.icon} aria-hidden="true">
                <Plus size={20} strokeWidth={2.5} />
              </span>
              <span className={c.label}>Log fiber sale</span>
              <ChevronRight className={c.chev} size={18} aria-hidden="true" />
            </Link>
            <Link href={SOLAR_DECK_HREF} className={c.choice} onClick={onClose}>
              <span className={c.icon} aria-hidden="true">
                <Sun size={20} strokeWidth={2.25} />
              </span>
              <span className={c.label}>Open solar deck</span>
              <ChevronRight className={c.chev} size={18} aria-hidden="true" />
            </Link>
          </div>
        </section>
      </div>
    </BodyLayer>
  );
}
