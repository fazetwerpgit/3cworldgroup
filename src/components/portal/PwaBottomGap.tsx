'use client';

import { useEffect } from 'react';
import { bottomGap } from '@/lib/pwa/bottomGap';

const VAR = '--pwa-bottom-gap';

function isStandalone(): boolean {
  // iOS 26 can report display-mode: standalone as false in a home-screen app,
  // so navigator.standalone comes first.
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  return typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches;
}

// Publishes --pwa-bottom-gap on <html>: how far the fixed bottom bars (tab bar,
// submit bars, sheets) drop to sit on the physical screen bottom when iOS 26
// leaves the installed app's viewport short (see lib/pwa/bottomGap). It is 0
// everywhere else, and re-measured whenever the viewport changes, since iOS
// corrects the height on its own after the first interaction. Renders nothing.
export default function PwaBottomGap() {
  useEffect(() => {
    const root = document.documentElement;
    // Fixed, invisible, 100lvh tall, with the top inset as padding to read back.
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText =
      'position:fixed;top:0;left:0;width:0;height:100lvh;padding-top:env(safe-area-inset-top);' +
      'visibility:hidden;pointer-events:none;box-sizing:content-box;';
    document.body.appendChild(probe);

    let current = -1;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const style = getComputedStyle(probe);
      const gap = bottomGap({
        standalone: isStandalone(),
        largeViewportHeight: parseFloat(style.height) || 0,
        safeAreaTop: parseFloat(style.paddingTop) || 0,
        innerHeight: window.innerHeight,
        innerWidth: window.innerWidth,
        screenWidth: window.screen?.width ?? 0,
        screenHeight: window.screen?.height ?? 0,
      });
      if (gap === current) return;
      current = gap;
      root.style.setProperty(VAR, `${gap}px`);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule();
    };

    measure();
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    window.addEventListener('pageshow', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.removeEventListener('pageshow', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      document.removeEventListener('visibilitychange', onVisible);
      probe.remove();
      root.style.removeProperty(VAR);
    };
  }, []);

  return null;
}
