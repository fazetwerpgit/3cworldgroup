import { isNativeApp } from './isNativeApp';

// Page zoom inside the 3C iOS app. A native app's chrome never pinches, so in
// the app the viewport is capped at scale 1 (WKWebView honours maximum-scale;
// only Safari ignores it). The image viewer lifts the cap while it is open, so
// a photo still pinches, and putting the cap back snaps the page to 1 again.
// On the web nothing here runs.

const CAP = 'maximum-scale=1';

let lifts = 0;

function viewportMeta(): HTMLMetaElement | null {
  return typeof document === 'undefined' ? null : document.querySelector('meta[name="viewport"]');
}

/** The viewport content without any maximum-scale / user-scalable entry. */
export function stripZoomCap(content: string): string {
  return content
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part && !/^(maximum-scale|user-scalable)\s*=/i.test(part))
    .join(', ');
}

/** The viewport content with the scale-1 cap. */
export function withZoomCap(content: string): string {
  const base = stripZoomCap(content);
  return base ? `${base}, ${CAP}` : `width=device-width, initial-scale=1, ${CAP}`;
}

function apply() {
  const meta = viewportMeta();
  if (!meta) return;
  const current = meta.getAttribute('content') ?? '';
  const next = lifts > 0 ? stripZoomCap(current) : withZoomCap(current);
  if (next !== current) meta.setAttribute('content', next);
}

/**
 * Caps pinch zoom in the app and keeps it capped when the router swaps the
 * viewport tag. Returns the uninstall (which lifts the cap). App only.
 */
export function installZoomCap(): () => void {
  if (typeof document === 'undefined' || !isNativeApp()) return () => {};
  apply();
  // Next may replace or rewrite the viewport tag on a route change.
  const observer = new MutationObserver(() => apply());
  observer.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['content'] });
  return () => {
    observer.disconnect();
    const meta = viewportMeta();
    if (meta) meta.setAttribute('content', stripZoomCap(meta.getAttribute('content') ?? ''));
  };
}

/** Lets the page pinch until the returned function runs (the image viewer). Nested calls are counted. */
export function allowPageZoom(): () => void {
  if (typeof document === 'undefined' || !isNativeApp()) return () => {};
  lifts += 1;
  apply();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    lifts = Math.max(0, lifts - 1);
    apply();
  };
}
