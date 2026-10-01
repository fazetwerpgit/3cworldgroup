'use client';

import { useEffect, useState } from 'react';
import PdfPages from '@/components/esign/PdfPages';
import l from './rep-learn.module.css';

/** iPhone, iPad and iPadOS (which reports itself as a Mac with a touch screen). */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * A lesson PDF. iOS Safari paints only the first page of a PDF inside an
 * iframe and gives no way to scroll to the rest, so there every page is drawn
 * to its own canvas. Everywhere else, and on iOS if the bytes cannot be read
 * (the storage host refusing a cross-origin fetch), the browser's own viewer
 * stays: it is no worse than before.
 */
export function TrainingPdf({ src, title }: { src: string; title: string }) {
  // null until mounted: the user agent does not exist on the server render.
  const [useCanvas, setUseCanvas] = useState<boolean | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUseCanvas(isIos());
  }, []);

  if (useCanvas === null) return null;
  if (useCanvas) return <PdfPages src={src} onError={() => setUseCanvas(false)} />;
  return <iframe src={src} title={title} className={l.pdf} />;
}
