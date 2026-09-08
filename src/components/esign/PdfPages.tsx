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
  const hostRef = useRef<HTMLDivElement>(null);
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [state, setState] = useState<LoadState>('loading');
  const [message, setMessage] = useState('');

  // Track the container width so a rotation re-renders at the new size instead
  // of leaving the rep with a stretched, blurry document.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const measure = () => {
      const next = Math.round(host.clientWidth);
      setContainerWidth((current) =>
        Math.abs(next - current) >= WIDTH_CHANGE_THRESHOLD ? next : current
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(host);
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

    const renderPages = async () => {
      const ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      host.replaceChildren();

      for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
        const page = await doc.getPage(pageNumber);
        if (cancelled) return;

        const unscaled = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (containerWidth / unscaled.width) * ratio });

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
  }, [doc, containerWidth]);

  return (
    <div>
      {state === 'loading' && <p className="member-line-note">Loading the document...</p>}
      {state === 'error' && (
        <p role="alert" className="member-line-note warn">
          {message} Reload the page to try again.
        </p>
      )}
      <div ref={hostRef} />
    </div>
  );
}

export default PdfPages;
