'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ExternalLink, FileText, Loader2, X } from 'lucide-react';
import { isPdfUrl } from '@/lib/forms/openAttachment';
import { BodyLayer } from './BodyLayer';
import s from './rep.module.css';
import v from './image-viewer.module.css';

export type ViewerContent =
  | { status: 'loading' }
  | { status: 'image'; url: string }
  | { status: 'pdf'; url: string }
  | { status: 'error'; message: string };

/**
 * Full-screen, in-app viewer for an image attachment. Opening one in a new tab
 * strands a rep in an iOS home-screen app (no tab bar, no back button), so this
 * stays on the page with an always-visible Close under the safe area. Close,
 * Escape, a tap on the dark area and the back gesture all dismiss it; focus
 * returns to whatever opened it. A PDF resolved while open gets an Open PDF
 * link instead (iOS has no reliable inline PDF preview), which is a real tap,
 * so Safari lets the new tab through.
 *
 * Render it only while open: mounting pushes a history entry, unmounting
 * consumes it again.
 */
export function ImageViewer({
  content,
  label,
  onClose,
  returnFocus,
}: {
  content: ViewerContent;
  /** Names the dialog and the image (e.g. "Screenshot 2"). */
  label: string;
  onClose: () => void;
  /** Focused again on close; defaults to what had focus when the viewer opened. */
  returnFocus?: HTMLElement | null;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);
  const [broken, setBroken] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Captured on the first render, before the dialog takes focus.
  const [opener] = useState<Element | null>(() =>
    returnFocus !== undefined ? returnFocus : typeof document === 'undefined' ? null : document.activeElement
  );

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        // Capture phase + stop: close only the viewer, not a sheet behind it.
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(
        dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), a[href]')
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && dialogRef.current.contains(active);
      if (event.shiftKey && (active === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (active === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey, true);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.body.style.overflow = previousOverflow;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
    };
  }, [opener]);

  // Back gesture closes the viewer instead of leaving the page: opening pushes
  // an entry, back pops it; closing any other way consumes it so history stays
  // balanced. The back() is deferred a tick so a StrictMode unmount/remount
  // keeps the same entry rather than racing a popstate into the new mount.
  const historyRef = useRef<{ pushed: boolean; backTimer: ReturnType<typeof setTimeout> | null }>({
    pushed: false,
    backTimer: null,
  });
  useEffect(() => {
    const h = historyRef.current;
    if (h.backTimer !== null) {
      clearTimeout(h.backTimer);
      h.backTimer = null;
    } else if (!h.pushed) {
      window.history.pushState({ imageViewer: true }, '');
      h.pushed = true;
    }
    const onPopState = () => {
      h.pushed = false;
      onCloseRef.current();
    };
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      if (!h.pushed) return;
      h.backTimer = setTimeout(() => {
        h.backTimer = null;
        h.pushed = false;
        window.history.back();
      }, 0);
    };
  }, []);

  const failed = content.status === 'error' || (content.status === 'image' && broken);

  return (
    <BodyLayer>
      <div ref={dialogRef} className={v.viewer} role="dialog" aria-modal="true" aria-label={label}>
        <div className={v.bar}>
          <p className={v.title}>{label}</p>
          <button ref={closeRef} type="button" className={v.close} onClick={() => onCloseRef.current()}>
            <X size={22} strokeWidth={2.5} aria-hidden="true" />
            Close
          </button>
        </div>
        <div
          className={v.stage}
          data-part="stage"
          onClick={(event) => {
            if (event.target === event.currentTarget) onCloseRef.current();
          }}
        >
          {failed ? (
            <div className={v.panel}>
              <AlertTriangle size={28} aria-hidden="true" />
              <p role="alert">
                {content.status === 'error' ? content.message : 'Could not load the image. Close and try again.'}
              </p>
            </div>
          ) : content.status === 'loading' ? (
            <div className={v.panel} role="status">
              <Loader2 size={28} className={v.spin} aria-hidden="true" />
              <span className={s.srOnly}>Loading {label.toLowerCase()}</span>
            </div>
          ) : content.status === 'pdf' ? (
            <div className={v.panel}>
              <FileText size={28} aria-hidden="true" />
              <p>This file is a PDF. It opens in a new tab.</p>
              <a className={s.btnSecondary} href={content.url} target="_blank" rel="noopener noreferrer">
                <ExternalLink size={18} aria-hidden="true" />
                Open PDF
              </a>
            </div>
          ) : content.status === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob: and signed URLs
            <img className={v.img} src={content.url} alt={label} onError={() => setBroken(true)} />
          ) : null}
        </div>
      </div>
    </BodyLayer>
  );
}

type ViewerState = { content: ViewerContent; label: string; returnFocus?: HTMLElement | null };

/**
 * Viewer state for a page: `show` a URL already in hand, or `open` one that
 * still has to be signed (the viewer shows a spinner, then the image, or an
 * Open PDF link when the file turns out to be a PDF). Render `viewer`.
 */
export function useAttachmentViewer() {
  const [state, setState] = useState<ViewerState | null>(null);
  const request = useRef(0);

  const close = useCallback(() => {
    request.current += 1;
    setState(null);
  }, []);

  const show = useCallback((url: string, label: string, returnFocus?: HTMLElement | null) => {
    request.current += 1;
    setState({ content: isPdfUrl(url) ? { status: 'pdf', url } : { status: 'image', url }, label, returnFocus });
  }, []);

  const open = useCallback(
    (resolveUrl: () => Promise<string | null>, label: string, returnFocus?: HTMLElement | null) => {
      const id = ++request.current;
      setState({ content: { status: 'loading' }, label, returnFocus });
      const settle = (content: ViewerContent) => {
        if (request.current === id) setState((prev) => (prev ? { ...prev, content } : prev));
      };
      const failed: ViewerContent = { status: 'error', message: 'Could not load the file. Close and try again.' };
      resolveUrl().then(
        (url) => settle(url ? (isPdfUrl(url) ? { status: 'pdf', url } : { status: 'image', url }) : failed),
        () => settle(failed)
      );
    },
    []
  );

  const viewer = state ? (
    <ImageViewer
      content={state.content}
      label={state.label}
      returnFocus={state.returnFocus}
      onClose={close}
    />
  ) : null;

  return { open, show, close, viewer };
}
