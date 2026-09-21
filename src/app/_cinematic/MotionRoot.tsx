"use client";

import { useEffect, useRef, useState } from "react";
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

  // The OS setting can change mid-visit. Reading the query once per navigation
  // meant a person who turned reduced motion on while reading kept every
  // entrance until they clicked something; this bumps a counter on the media
  // query's own change event so the effect below re-runs and re-decides.
  const [motionEpoch, setMotionEpoch] = useState(0);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setMotionEpoch((n) => n + 1);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

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
      // Belt and braces, and the reason it is not a one-shot timeout: a jump
      // scroll lands the viewport somewhere IO may not report on — the entry
      // for a section skipped over is never delivered, and a single deadline
      // that has already passed cannot rescue it, so the copy stays at opacity
      // 0 for the rest of the visit. This sweep runs on the same rAF the rest
      // of the file uses and shows anything the viewport has reached or passed.
      // Hidden copy is a worse failure than a missed entrance.
      let pending = reveals.slice();
      let sweepFrame = 0;
      const sweep = () => {
        sweepFrame = 0;
        const vh = window.innerHeight;
        pending = pending.filter((el) => {
          if (el.dataset.shown) return false;
          // `top < vh` is true once the element has been reached and stays true
          // after it is scrolled past, so one test covers both the section you
          // are arriving at and every section a jump skipped over.
          if (el.getBoundingClientRect().top >= vh) return true;
          el.dataset.shown = "true";
          return false;
        });
        if (!pending.length) detachSweep();
      };
      const scheduleSweep = () => {
        if (!sweepFrame) sweepFrame = requestAnimationFrame(sweep);
      };
      const detachSweep = () => {
        window.removeEventListener("scroll", scheduleSweep);
        window.removeEventListener("resize", scheduleSweep);
      };
      window.addEventListener("scroll", scheduleSweep, { passive: true });
      window.addEventListener("resize", scheduleSweep);
      // Two frames, for the same reason the hero entrance waits: the gated
      // style has to be painted before the shown style, or the transition is
      // collapsed by one style recalculation and the entrance never runs.
      const firstSweep = requestAnimationFrame(() => {
        requestAnimationFrame(sweep);
      });
      cleanups.push(() => {
        detachSweep();
        cancelAnimationFrame(firstSweep);
        if (sweepFrame) cancelAnimationFrame(sweepFrame);
      });
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
  }, [pathname, motionEpoch]);

  return <div ref={rootRef}>{children}</div>;
}

/**
 * Behaviour that is navigation, not decoration: which chapter you are reading,
 * and whether the compact apply bar is due. These run even under reduced
 * motion, because switching them off would remove function, not flourish.
 */
function attachStatic(root: HTMLElement): () => void {
  const cleanups: Array<() => void> = [];
  const stage = root.querySelector<HTMLElement>("[data-chapter-stage]");
  const chapters = Array.from(root.querySelectorAll<HTMLElement>("[data-chapter]"));
  if (stage && chapters.length) {
    // The original IntersectionObserver watched a narrow centre band. A fast
    // jump — a hash link, a restored scroll position, Careers and back — can
    // cross every chapter without any of them being sampled inside that band,
    // and the stage then keeps whichever image it was last told about. So the
    // active chapter is derived, not accumulated: one function reads geometry
    // and is the only writer of `data-active-chapter`, which makes every entry
    // path (load, scroll, resize, restore) converge on the same answer.
    let frame = 0;
    let lastIndex = -1;
    const reconcile = () => {
      frame = 0;
      /*
        R8 — the active chapter is the LAST one whose top has crossed a reading
        line a third of the way down the viewport, and the line no longer moves
        with the sticky stage.

        Two bugs came out of the old model. Nearest-centre could never reach
        the third chapter: while the stage is pinned the list's bottom cannot
        rise above the stage's own bottom, so the final chapter's centre stops
        short of the centre line and the second chapter wins forever — the
        stage's third photograph was unreachable at every desktop width. And a
        line measured inside the stage answers differently depending on whether
        the stage is pinned, so no single fraction of it was right both as the
        section enters and as it releases. A fixed viewport line is the thing a
        reader actually uses, and it is the same line at every scroll state.
      */
      const headerClearance = Math.min(112, Math.max(76, window.innerHeight * 0.11));
      const targetY = headerClearance + (window.innerHeight - headerClearance) * 0.32;
      const rects = chapters.map((chapter) => chapter.getBoundingClientRect());
      let bestIndex = 0;
      rects.forEach((rect, index) => {
        if (rect.top <= targetY) bestIndex = index;
      });
      if (bestIndex === lastIndex) return;
      lastIndex = bestIndex;
      stage.dataset.activeChapter = String(bestIndex);
      chapters.forEach((chapter, index) => {
        if (index === bestIndex) chapter.dataset.current = "true";
        else delete chapter.dataset.current;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(reconcile);
    };
    reconcile();
    // A restored scroll position and the sticky stage's own images both land
    // after hydration, so read the geometry once more when it has settled.
    const settle = requestAnimationFrame(() => {
      frame = requestAnimationFrame(reconcile);
    });
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    cleanups.push(() => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      cancelAnimationFrame(settle);
      if (frame) cancelAnimationFrame(frame);
    });
  }

  // The compact apply bar is homepage-only by design, and this pairing is the
  // reason: it is revealed when `[data-hero]` leaves the viewport, and the
  // photographic hero belongs to the homepage alone. An interior page opens on
  // the kit's flat `.pageHead` and closes on its own apply CTA, so it renders
  // no bar; the rule is written down in docs/cinematic/PAGE-KIT.md.
  const hero = root.querySelector<HTMLElement>("[data-hero]");
  const applyBar = root.querySelector<HTMLElement>("[data-apply-bar]");
  if (hero && applyBar && typeof IntersectionObserver !== "undefined") {
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
