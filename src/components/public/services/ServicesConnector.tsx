"use client";

import { useEffect, useRef, type ReactNode } from "react";
import styles from "./services.module.css";

const MOBILE_BREAKPOINT = 720;
const CUT_SPAN_RATIO = 0.086;

export default function ServicesConnector({
  children,
}: {
  children: ReactNode;
}) {
  const flowRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const flow = flowRef.current;
    if (!flow) return;

    let frame: number | null = null;
    let disposed = false;

    const clearGeometry = () => {
      flow.style.removeProperty("--cut-rise");
      flow.style.removeProperty("--cut-slope");
      flow.style.removeProperty("--hero-line-top");
      flow.style.removeProperty("--hero-line-bottom");
      flow.style.removeProperty("--hero-line-shift");
      flow.style.removeProperty("--fiber-join-offset");
      flow
        .querySelectorAll<HTMLElement>("[data-cut-row]")
        .forEach((row) => {
          row.style.removeProperty("--photo-line-top");
          row.style.removeProperty("--photo-line-bottom");
        });
    };

    const measure = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        frame = null;
        if (disposed) return;

        if (window.innerWidth <= MOBILE_BREAKPOINT) {
          clearGeometry();
          return;
        }

        const rows = Array.from(
          flow.querySelectorAll<HTMLElement>("[data-cut-row]"),
        );
        if (rows.length < 2) return;

        const flowRect = flow.getBoundingClientRect();
        const rowHeights = rows.map((row) => row.getBoundingClientRect().height);
        const artworks = rows.map((row) =>
          row.querySelector<HTMLElement>(
            `.${styles.serviceArtwork}, .${styles.bundleArtwork}`,
          ),
        );
        if (artworks.some((artwork) => artwork === null)) return;
        const artworkRects = artworks.map((artwork) =>
          artwork!.getBoundingClientRect(),
        );
        const currentRise =
          Number.parseFloat(
            getComputedStyle(flow).getPropertyValue("--cut-rise"),
          ) || 0;
        const baselineHeight = rowHeights.reduce(
          (sum, height) => sum + Math.max(0, height - currentRise),
          0,
        );
        const horizontalSpan = CUT_SPAN_RATIO * flowRect.width;
        const cutRise =
          (-baselineHeight +
            Math.sqrt(
              baselineHeight * baselineHeight +
                4 * horizontalSpan * flowRect.width,
            )) /
          2;
        const stackHeight = baselineHeight + cutRise;
        const slope = horizontalSpan / stackHeight;

        flow.style.setProperty("--cut-rise", `${cutRise.toFixed(3)}px`);
        flow.style.setProperty("--cut-slope", slope.toFixed(6));
        flow.style.setProperty(
          "--fiber-join-offset",
          `${(slope * cutRise).toFixed(3)}px`,
        );

        const hero = flow.querySelector<HTMLElement>(`.${styles.hero}`);
        if (hero) {
          const heroHeight = hero.getBoundingClientRect().height;
          const heroLineBottom = slope * heroHeight;
          flow.style.setProperty(
            "--hero-line-top",
            "0px",
          );
          flow.style.setProperty(
            "--hero-line-bottom",
            `${heroLineBottom.toFixed(3)}px`,
          );
          flow.style.setProperty(
            "--hero-line-shift",
            `${heroLineBottom.toFixed(3)}px`,
          );
        }

        rows.forEach((row, index) => {
          const artworkRect = artworkRects[index];
          const lineTop = 0;
          const lineBottom = slope * artworkRect.height;
          row.style.setProperty("--photo-line-top", `${lineTop}px`);
          row.style.setProperty(
            "--photo-line-bottom",
            `${lineBottom.toFixed(3)}px`,
          );
        });
      });
    };

    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(flow);
    flow
      .querySelectorAll<HTMLElement>(
        "[data-cut-row], [data-cut-row] > div, [class*='serviceArtwork'], [class*='bundleArtwork']",
      )
      .forEach((element) => resizeObserver.observe(element));
    void document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });
    measure();

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      if (frame !== null) cancelAnimationFrame(frame);
      clearGeometry();
    };
  }, []);

  return (
    <div ref={flowRef} className={styles.cutFlow} data-service-flow="true">
      {children}
    </div>
  );
}
