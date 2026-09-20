"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * Every piece of authored motion on this page, in one bounded client file.
 *
 * The contract it keeps: the server already renders the page in its finished
 * state. This component only sets `data-motion="on"`, and every pre-reveal
 * style in cinematic-home.module.css is written behind that attribute. So with
 * JavaScript off, or with `prefers-reduced-motion: reduce`, nothing is hidden,
 * nothing waits, and the route line is simply drawn.
 */
export default function MotionRoot({ children }: { children: React.ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  // This component lives in the shared layout, so it mounts once per visit.
  // Every client-side navigation swaps the page underneath it, bringing new
  // [data-reveal] elements that the first run never observed. Re-running on
  // the pathname tears the old observers down and wires the new page up;
  // without it, every page reached from the nav stays hidden behind the gate.
  const pathname = usePathname();

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    // Every pre-reveal style is gated on data-motion="on", and the thing that
    // takes it back off again is an IntersectionObserver. If IO is missing we
    // must not set the attribute at all, or the gate closes on content that has
    // nothing left to open it.
    const canObserve = typeof IntersectionObserver !== "undefined";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced || !canObserve) {
      // Still turn on the interaction affordances that are not entrances: the
      // mobile apply bar has to appear, and the sticky visual still has to
      // follow the chapter you are reading. Only the drift and the draw stop.
      return attachStatic(root);
    }

    root.dataset.motion = "on";
    const cleanups: Array<() => void> = [];

    // --- Hero entrance ------------------------------------------------------
    // One frame after paint so the pre-reveal state is committed first and the
    // transition actually runs rather than being collapsed by the same style
    // recalculation.
    const entranceFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        root.dataset.entered = "true";
      });
    });
    cleanups.push(() => cancelAnimationFrame(entranceFrame));

    // --- Hero pointer drift (desktop, fine pointer only) --------------------
    const heroArt = root.querySelector<HTMLElement>("[data-hero-art]");
    const fine = window.matchMedia("(pointer: fine) and (min-width: 901px)");
    if (heroArt && fine.matches) {
      let frame = 0;
      let targetX = 0;
      let targetY = 0;
      const apply = () => {
        frame = 0;
        heroArt.style.setProperty("--drift-x", `${targetX.toFixed(2)}px`);
        heroArt.style.setProperty("--drift-y", `${targetY.toFixed(2)}px`);
      };
      const onPointerMove = (event: PointerEvent) => {
        const nx = event.clientX / window.innerWidth - 0.5;
        const ny = event.clientY / window.innerHeight - 0.5;
        targetX = -nx * 14;
        targetY = -ny * 10;
        if (!frame) frame = requestAnimationFrame(apply);
      };
      const onPointerLeave = () => {
        targetX = 0;
        targetY = 0;
        if (!frame) frame = requestAnimationFrame(apply);
      };
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.addEventListener("pointerleave", onPointerLeave);
      cleanups.push(() => {
        window.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerleave", onPointerLeave);
        if (frame) cancelAnimationFrame(frame);
      });
    }

    // --- Section reveals, fired once each ------------------------------------
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    if (reveals.length) {
      const io = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            (entry.target as HTMLElement).dataset.shown = "true";
            io.unobserve(entry.target);
          }
        },
        { rootMargin: "0px 0px -12% 0px", threshold: 0.12 },
      );
      reveals.forEach((el) => io.observe(el));
      cleanups.push(() => io.disconnect());
      // Belt and braces: if the observer has not reported on something that is
      // already inside the viewport, show it anyway. Hidden copy is a worse
      // failure than a missed entrance.
      const fallback = window.setTimeout(() => {
        const vh = window.innerHeight;
        for (const el of reveals) {
          if (el.dataset.shown) continue;
          const r = el.getBoundingClientRect();
          if (r.top < vh && r.bottom > 0) el.dataset.shown = "true";
        }
      }, 1200);
      cleanups.push(() => window.clearTimeout(fallback));
    }

    // --- The route line: the page's second authored moment -------------------
    const routeSection = root.querySelector<HTMLElement>("[data-route-section]");
    const stops = Array.from(root.querySelectorAll<HTMLElement>("[data-stop]"));
    if (routeSection) {
      let frame = 0;
      // The draw only ever goes forward. Scrubbing it backwards on the way up
      // would erase four steps of real copy the moment someone scrolls back to
      // re-read them, and would leave the section blank in any screenshot taken
      // at the top of the page. Drawing is the flourish; the words are not.
      let peak = 0;
      // The stacked route is a different drawing from the wide one, so each
      // stop sits at a different fraction of its path. Pick the right set.
      const stacked = window.matchMedia("(max-width: 900px)");
      const measure = () => {
        frame = 0;
        const rect = routeSection.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        const span = Math.max(240, rect.height * 0.62);
        const raw = (vh * 0.82 - rect.top) / span;
        const clamped = Math.min(1, Math.max(0, raw));
        // Ease out so the line decelerates into its final stop instead of
        // stopping dead the instant the scroll range runs out.
        const eased = 1 - Math.pow(1 - clamped, 1.7);
        if (eased <= peak) return;
        peak = eased;
        routeSection.style.setProperty("--route-progress", peak.toFixed(4));
        const useStacked = stacked.matches;
        for (const stop of stops) {
          const at = Number((useStacked ? stop.dataset.atSm : stop.dataset.at) ?? stop.dataset.at ?? "0");
          if (peak >= at) stop.dataset.arrived = "true";
        }
      };
      const schedule = () => {
        if (!frame) frame = requestAnimationFrame(measure);
      };
      measure();
      window.addEventListener("scroll", schedule, { passive: true });
      window.addEventListener("resize", schedule);
      cleanups.push(() => {
        window.removeEventListener("scroll", schedule);
        window.removeEventListener("resize", schedule);
        if (frame) cancelAnimationFrame(frame);
      });
    }

    cleanups.push(attachStatic(root));

    return () => {
      cleanups.forEach((fn) => fn());
      delete root.dataset.motion;
      delete root.dataset.entered;
    };
  }, [pathname]);

  return <div ref={rootRef}>{children}</div>;
}

/**
 * Behaviour that is navigation, not decoration: which chapter you are reading,
 * and whether the compact apply bar is due. These run even under reduced
 * motion, because switching them off would remove function, not flourish.
 */
function attachStatic(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  if (typeof IntersectionObserver === "undefined") return () => {};

  const stage = root.querySelector<HTMLElement>("[data-chapter-stage]");
  const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]"));
  if (stage && chapters.length) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = chapters.indexOf(entry.target as HTMLElement);
          if (index < 0) continue;
          stage.dataset.activeChapter = String(index);
          chapters.forEach((chapter, i) => {
            if (i === index) chapter.dataset.current = "true";
            else delete chapter.dataset.current;
          });
        }
      },
      { rootMargin: "-46% 0px -46% 0px", threshold: 0 },
    );
    chapters.forEach((chapter) => io.observe(chapter));
    cleanups.push(() => io.disconnect());
  }

  // The compact apply bar is homepage-only by design, and this pairing is the
  // reason: it is revealed when `[data-hero]` leaves the viewport, and the
  // photographic hero belongs to the homepage alone. An interior page opens on
  // the kit's flat `.pageHead` and closes on its own apply CTA, so it renders
  // no bar; the rule is written down in docs/cinematic/PAGE-KIT.md.
  const hero = root.querySelector<HTMLElement>("[data-hero]");
  const applyBar = root.querySelector<HTMLElement>("[data-apply-bar]");
  if (hero && applyBar) {
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) delete applyBar.dataset.visible;
        else applyBar.dataset.visible = "true";
      },
      { threshold: 0 },
    );
    io.observe(hero);
    cleanups.push(() => io.disconnect());
  }

  return () => cleanups.forEach((fn) => fn());
}
