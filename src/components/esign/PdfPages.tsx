'use client';

import { useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

/**
 * A 3x backing store on a six-page W-9 is a lot of canvas memory for a phone.
 * Two is already past what an iPhone screen resolves at this size.
 */
const MAX_PIXEL_RATIO = 2;
/** Ignore sub-pixel container jitter; only a real width change re-renders. */
const WIDTH_CHANGE_THRESHOLD = 8;
/**
 * A Letter page inside a phone-width panel lands near 320 CSS px, which is not
 * readable. Zoomed, the pages are laid out at twice that and the rep pans.
 */
const ZOOM_SCALE = 2;

interface Props {
  /** URL of the blank source PDF; fetched as bytes, never handed to an iframe. */
  src: string;
  /** Returns the Authorization header for `src`. Must be referentially stable. */
  authHeaders?: () => Promise<Record<string, string>>;
}

type LoadState = 'loading' | 'ready' | 'error';

/**
 * Renders every page of a PDF to its own canvas. pdfjs is imported inside the
 * effect (never at module scope) because the library touches DOM globals at
 * import time and this component is rendered by a server-rendered route.
 */
export function PdfPages({ src, authHeaders }: Props) {
  /** The horizontal scroller. Its width is the fit-width measurement. */
  const frameRef = useRef<HTMLDivElement>(null);
  /** Holds the canvases; grows past the frame when zoomed. */
  const hostRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('');

  // Track the frame width so a rotation re-renders at the new size instead of
  // leaving the rep with a stretched, blurry document. Measuring the frame and
  // not the host keeps zooming from feeding its own width back in.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    const measure = () => {
      const next = Math.round(frame.clientWidth);
      setContainerWidth((current) =>
        Math.abs(next - current) >= WIDTH_CHANGE_THRESHOLD ? next : current
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    return () => observer.disconnect();
  }, []);

  // Fetch the bytes and open the document.
  useEffect(() => {
    let cancelled = false;
    let opened: PDFDocumentProxy | null = null;

    const load = async () => {
      setState('loading');
      setMessage('');
      const headers = authHeaders ? await authHeaders() : undefined;
      const response = await fetch(src, { headers, cache: 'no-store' });
      if (!response.ok) throw new Error('We could not load this document.');
      const data = await response.arrayBuffer();
      if (cancelled) return;

      const pdfjs = await import('pdfjs-dist');
      // Bundled worker, resolved by the build - never a CDN.
      pdfjs.GlobalWorkerOptions.workerSrc = new URL(
        'pdfjs-dist/build/pdf.worker.min.mjs',
        import.meta.url
      ).toString();

      opened = await pdfjs.getDocument({ data }).promise;
      if (cancelled) {
        void opened.destroy();
        return;
      }
      setDoc(opened);
    };

    void load().catch((error: unknown) => {
      if (cancelled) return;
      setState('error');
      setMessage(error instanceof Error ? error.message : 'We could not load this document.');
    });

    return () => {
      cancelled = true;
      setDoc(null);
      if (opened) void opened.destroy();
    };
  }, [src, authHeaders]);

  // Paint the pages. Reruns when the document or the available width changes.
  useEffect(() => {
    const host = hostRef.current;
    if (!doc || !host || containerWidth === 0) return;

    let cancelled = false;
    const tasks: RenderTask[] = [];
    // Zoomed, the pages are laid out wider than the frame and the frame scrolls.
    const layoutWidth = zoomed ? containerWidth * ZOOM_SCALE : containerWidth;
    host.style.width = zoomed ? `${layoutWidth}px` : '100%';

    const renderPages = async () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      host.replaceChildren();

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (layoutWidth / unscaled.width) * ratio });

        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(viewport.width);
        canvas.height = Math.floor(viewport.height);
        // CSS size is the layout size; the backing store above is the sharp one.
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.className = 'mb-3 block w-full rounded-md border border-slate-300 bg-white shadow-sm';
        canvas.setAttribute('role', 'img');
        canvas.setAttribute('aria-label', `Page ${pageNumber} of ${doc.numPages}`);
        host.append(canvas);

        const task = page.render({ canvas, viewport });
        tasks.push(task);
        await task.promise;
        if (cancelled) return;
        // The first painted page is enough to drop the loading note.
        if (pageNumber === 1) setState('ready');
      }
      setState('ready');
    };

    void renderPages().catch((error: unknown) => {
      // Cancelling in-flight renders is normal teardown, not a failure.
      if (cancelled) return;
      setState('error');
      setMessage(error instanceof Error ? error.message : 'We could not display this document.');
    });

    return () => {
      cancelled = true;
      for (const task of tasks) task.cancel();
    };
  }, [doc, containerWidth, zoomed]);

  return (
    <div>
      {/* Sticky: the pages sit in their own 60vh scroller, so a static toolbar
          would scroll out of reach on the second page. */}
      <div className="sticky top-0 z-10 mb-2 flex items-center justify-between gap-3 bg-[color:var(--member-line-panel,#ffffff)] py-1">
        <p className="text-sm text-[color:var(--member-line-muted,#5b6b7d)]">
          {zoomed ? 'Scroll sideways to read across the page.' : 'Too small to read?'}
        </p>
        <button
          type="button"
          onClick={() => setZoomed((current) => !current)}
          aria-pressed={zoomed}
          disabled={state !== 'ready'}
          className="min-h-11 shrink-0 rounded-md border border-[color:var(--member-line-line,#26364a)] px-4 text-sm font-semibold text-[color:var(--member-line-ink,#0a1f44)] disabled:opacity-50"
        >
          {zoomed ? 'Fit width' : 'Zoom in'}
        </button>
      </div>
      {state === 'loading' && <p className="member-line-note">Loading the document...</p>}
      {state === 'error' && (
        <p role="alert" className="member-line-note warn">
          {message} Reload the page to try again.
        </p>
      )}
      {/* The scroller owns the horizontal overflow, so a zoomed page never
          widens the page body on a phone. */}
      <div ref={frameRef} className="max-w-full overflow-x-auto overscroll-x-contain">
        <div ref={hostRef} />
      </div>
    </div>
  );
}

export default PdfPages;
