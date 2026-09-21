"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * useLayoutEffect, except on the server, where React warns about it and where
 * "before the browser paints" has no meaning anyway. Used for exactly one thing
 * below, and the comment there explains why a normal effect is too late.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Every piece of authored motion on this page, in one bounded client file.
 *
 * The contract it keeps: the server already renders the page in its finished
 * state. Motion only exists behind three attributes on <html>, and every
 * pre-reveal style is written behind them:
 *
 *   data-motion="on"  motion is wanted at all — JS runs, reduced motion is off
 *   data-entered      the page you are on has arrived; cleared and re-set on
 *                     every navigation, so page-level entrances replay
 *   data-booted       this document has opened once, and never un-opens. What
 *                     the persistent chrome keys on, so the header does not
 *                     replay its entrance on every navigation
 *
 * A fourth, `data-motion-bailed`, is written by the boot script rather than
 * here: it says hydration was too slow to be worth waiting for, and this
 * component then stays on its static path for good.
 *
 * With JavaScript off, or with `prefers-reduced-motion: reduce`, none of them
 * is set: nothing is hidden, nothing waits, and the route line is simply drawn.
 *
 * They live on documentElement rather than on this component's own
 * wrapper. That is not cosmetic: the pre-reveal gate has to be in force before
 * the first paint or a warm cache shows the finished hero for a beat and then
 * hides it, so `data-motion` is opened by a blocking inline script in
 * (cinematic)/layout.tsx and <html> is the only element that exists that early.
 * This effect remains the owner of both attributes' lifecycle — it re-decides
 * on the reduced-motion switch, re-wires per pathname, and takes them off on
 * unmount. It just no longer owns the first frame of `data-motion`.
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

  /*
    Take the entrance back off BEFORE the new page is painted.

    On a client-side navigation React commits the new page's DOM, paints it, and
    only then runs passive effects. `data-entered` is still set from the route
    you came from, so that first paint shows the page you arrived at fully
    formed — and the effect below then strips the attribute and the copy snaps
    to its hidden state and animates in. Measured at one painted frame on every
    navigation: a blink of finished content, which reads as the entrance
    misfiring rather than as an entrance.

    A layout effect runs after the commit and before that paint, so the
    pre-reveal state is the first thing on screen here for the same reason the
    layout's boot script arranges it on a cold load. It is deliberately the only
    thing in here: everything that can wait belongs in the passive effect, which
    is not allowed to block a paint.
  */
  useBeforePaint(() => {
    delete document.documentElement.dataset.entered;
  }, [pathname, motionEpoch]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const doc = document.documentElement;

    // Every pre-reveal style is gated on data-motion="on", and the thing that
    // takes it back off again is an IntersectionObserver. If IO is missing we
    // must not set the attribute at all, or the gate closes on content that has
    // nothing left to open it.
    const canObserve = typeof IntersectionObserver !== "undefined";
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // The boot script gives up on this document if hydration has not proved
    // itself within 1.5s, and leaves `data-motion-bailed` behind when it does.
    // Honouring it is the whole point: without this check a slow phone showed
    // the copy, finished waiting, showed it for another second, and then had it
    // taken away again the moment React finally arrived — content going visible
    // and then hidden, which is worse than either state on its own. The flag is
    // never cleared, so the decision holds for the life of the document and no
    // later navigation re-gates a page the reader is already reading.
    const bailed = doc.dataset.motionBailed === "true";
    if (reduced || !canObserve || bailed) {
      // The boot script tested these same two conditions, but it tested them
      // before hydration. If either has changed since — reduced motion switched
      // on while the page was still loading, or mid-visit, which re-runs this
      // effect — the gate it opened has to be closed here. Deleting rather than
      // trusting the previous run's cleanup matters on the first run, where
      // there is no previous cleanup and the script's snapshot is all there is.
      delete doc.dataset.motion;
      delete doc.dataset.entered;
      // `data-booted` and `data-motion-bailed` are deliberately left alone here
      // and in the cleanup. One records that this document has already played
      // its opening, the other that it gave up waiting to; both stay true
      // whether or not motion is currently on.
      // Still turn on the interaction affordances that are not entrances: the
      // mobile apply bar has to appear, and the sticky visual still has to
      // follow the chapter you are reading. Only the drift and the draw stop.
      return attachStatic(root);
    }

    // Normally already set, and by the layout's boot script rather than here.
    // Written again because a client-side navigation into this group from a
    // route outside it never re-runs that script.
    doc.dataset.motion = "on";
    const cleanups: Array<() => void> = [];

    // --- Hero entrance ------------------------------------------------------
    // One frame after paint so the pre-reveal state is committed first and the
    // transition actually runs rather than being collapsed by the same style
    // recalculation.
    const entranceFrame = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        doc.dataset.entered = "true";
        // `data-booted` is set here with the first entrance and then never
        // taken off again, by any path: not by the cleanup below, not by the
        // reduced-motion branch above, not by a navigation. It exists for the
        // things that live in the LAYOUT rather than on a page — the site
        // header above all — which would otherwise replay their entrance on
        // every client-side navigation, because `data-entered` is cleared and
        // re-set per route and the header never unmounts between them. Keying
        // those on `[data-booted]` gives them the one entrance they should
        // have: on the first arrival, and not again for the life of the
        // document. Page-level entrances stay on `data-entered` and do replay.
        doc.dataset.booted = "true";
      });
    });
    cleanups.push(() => cancelAnimationFrame(entranceFrame));

    // --- Hero pointer drift and road glow (desktop, fine pointer only) ------
    //
    // Bound and unbound on the media query's own change event, not on one
    // read at mount. The effect below re-runs on navigation and on the
    // reduced-motion switch, and neither of those fires when a window is
    // dragged wider: a visit that started at 800px kept no listeners, so the
    // hero never lit at 1400px until the next page load. `change` is the only
    // signal that crosses 901px, so it is the one that decides.
    const heroArt = root.querySelector<HTMLElement>("[data-hero-art]");
    const heroSection = root.querySelector<HTMLElement>("[data-hero]");
    const fine = window.matchMedia("(pointer: fine) and (min-width: 901px)");
    if (heroArt) {
      const bind = () => {
        const inner: Array<() => void> = [];
        let frame = 0;
        let targetX = 0;
        let targetY = 0;
        // The second thing this block drives: where the hero's own lit roads
        // brighten. `.heroGlow` is a child of [data-hero-art], so its mask
        // centre is in that box's coordinate space, not the viewport's —
        // hence the rect subtraction rather than clientX/clientY straight
        // through. Reading the live rect each frame is deliberate: the box is
        // inset -8px AND carries a 0.6s drift transition, so its painted
        // position lags the target, and only the real rect keeps the light
        // under the actual cursor instead of 7px behind it.
        let pointerX = 0;
        let pointerY = 0;
        let glowLive = false;
        const write = () => {
          if (glowLive) {
            const rect = heroArt.getBoundingClientRect();
            heroArt.style.setProperty("--glow-x", `${(pointerX - rect.left).toFixed(1)}px`);
            heroArt.style.setProperty("--glow-y", `${(pointerY - rect.top).toFixed(1)}px`);
          }
          heroArt.style.setProperty("--drift-x", `${targetX.toFixed(2)}px`);
          heroArt.style.setProperty("--drift-y", `${targetY.toFixed(2)}px`);
        };
        const apply = () => {
          frame = 0;
          write();
        };
        const onPointerMove = (event: PointerEvent) => {
          const nx = event.clientX / window.innerWidth - 0.5;
          const ny = event.clientY / window.innerHeight - 0.5;
          targetX = -nx * 14;
          targetY = -ny * 10;
          pointerX = event.clientX;
          pointerY = event.clientY;
          if (!frame) frame = requestAnimationFrame(apply);
        };
        const onPointerLeave = () => {
          targetX = 0;
          targetY = 0;
          if (!frame) frame = requestAnimationFrame(apply);
        };
        window.addEventListener("pointermove", onPointerMove, { passive: true });
        document.addEventListener("pointerleave", onPointerLeave);
        inner.push(() => {
          window.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerleave", onPointerLeave);
          if (frame) cancelAnimationFrame(frame);
          // Unbinding below 901px has to put the frame back where it was, or
          // the phone layout inherits whatever offset the pointer left behind.
          heroArt.style.removeProperty("--drift-x");
          heroArt.style.removeProperty("--drift-y");
        });

        // Enter and leave on the hero SECTION, not the art: the art is under
        // the scrim and the copy, so a pointer over the headline is not over
        // it. pointerenter/pointerleave do not bubble, so one pair on the
        // section is the whole subtree. The centre is written from the enter
        // event itself before the attribute lands, so the layer fades up where
        // the pointer already is rather than sliding in from the last visit.
        if (heroSection) {
          const onGlowEnter = (event: PointerEvent) => {
            pointerX = event.clientX;
            pointerY = event.clientY;
            glowLive = true;
            write();
            // `data-glow-armed` is what names the 300KB glow file in CSS, and
            // it is set here rather than in the stylesheet so the request is
            // made by the first mouse that enters the hero and by nothing
            // else. On a desktop load with no pointer — a scroll, a tab left
            // open, an audit — the file is never fetched at all, and it never
            // competes with the hero photograph for the LCP. It is never
            // taken back off: a second entrance should light the roads from
            // the cache, not re-request.
            heroArt.dataset.glowArmed = "true";
            heroArt.dataset.glow = "on";
          };
          const onGlowLeave = () => {
            glowLive = false;
            delete heroArt.dataset.glow;
          };
          heroSection.addEventListener("pointerenter", onGlowEnter);
          heroSection.addEventListener("pointerleave", onGlowLeave);
          inner.push(() => {
            heroSection.removeEventListener("pointerenter", onGlowEnter);
            heroSection.removeEventListener("pointerleave", onGlowLeave);
            delete heroArt.dataset.glow;
          });
        }
        return () => inner.forEach((fn) => fn());
      };

      let detach: (() => void) | null = null;
      const syncFine = () => {
        if (fine.matches && !detach) detach = bind();
        else if (!fine.matches && detach) {
          detach();
          detach = null;
        }
      };
      syncFine();
      fine.addEventListener("change", syncFine);
      cleanups.push(() => {
        fine.removeEventListener("change", syncFine);
        if (detach) detach();
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

    // --- The route: one triggered draw, not a scroll scrub -------------------
    // The line used to scrub with the scroll position, which tied the pen to
    // how fast a person happened to be moving: a flick drew all four blocks
    // inside one frame, a slow read left the stroke stranded half-finished for
    // a page of copy, and no stop could know when the line would reach it. It
    // is now a fixed-length draw that starts once, so the stroke reads at the
    // same speed every visit and each stop derives its own delay from its
    // fraction of the path (`--route-at`, see cinematic-home.module.css).
    //
    // Both switches below are wired at every width and the CSS decides which
    // one applies, because a resize across 900px can land mid-sequence: the
    // wide route follows one pen, the stacked rail advances step by step.
    // Attributes are layout-agnostic; only the rules reading them are not.
    const routeSection = root.querySelector<HTMLElement>("[data-route-section]");
    if (routeSection) {
      const stops = Array.from(routeSection.querySelectorAll<HTMLElement>("[data-stop]"));

      // Fire-once, like every other entrance here: re-drawing the route when
      // someone scrolls back to re-read it would erase four steps of real copy.
      const startDraw = () => {
        routeSection.dataset.drawn = "true";
      };
      // The stacked rail only ever goes forward, for the same reason.
      let rail = 0;
      const arrive = (stop: HTMLElement) => {
        if (stop.dataset.arrived) return;
        stop.dataset.arrived = "true";
        const at = Number(stop.dataset.atSm ?? "0");
        if (at <= rail) return;
        rail = at;
        routeSection.style.setProperty("--rail-progress", rail.toFixed(4));
      };
      const reach = (el: HTMLElement) => {
        if (el.hasAttribute("data-stop")) arrive(el);
        else startDraw();
      };

      // What starts the draw is the drawing's own box, not the section's. The
      // section opens on a section pad and a two-line heading, some 240px of
      // it, so a line measured on the section top fired while the canvas was
      // still a full viewport below the fold and the stroke was finished
      // before it came into frame. `[data-route-draw]` is the canvas itself.
      //
      // Each target carries the fraction of the viewport its top has to cross.
      // 0.55 for the canvas puts stop 01's row on screen as the pen leaves it;
      // 0.74 for a stacked step is the same line the rest of the page reveals
      // on. Both are expressed twice — as an IntersectionObserver rootMargin
      // and as a number the sweep compares against — because the sweep is the
      // only thing that catches a section the observer never reports on.
      const canvas = routeSection.querySelector<HTMLElement>("[data-route-draw]") ?? routeSection;
      const targets: Array<[HTMLElement, number]> = [
        [canvas, 0.55],
        ...stops.map((stop) => [stop, 0.74] as [HTMLElement, number]),
      ];
      const observers = new Map<number, IntersectionObserver>();
      const observerFor = (line: number) => {
        const existing = observers.get(line);
        if (existing) return existing;
        const io = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              reach(entry.target as HTMLElement);
              io.unobserve(entry.target);
            }
          },
          { rootMargin: `0px 0px -${Math.round((1 - line) * 100)}% 0px`, threshold: 0 },
        );
        observers.set(line, io);
        return io;
      };
      targets.forEach(([el, line]) => observerFor(line).observe(el));
      const unobserve = (el: HTMLElement) => {
        observers.forEach((io) => io.unobserve(el));
      };
      cleanups.push(() => observers.forEach((io) => io.disconnect()));

      // The same belt-and-braces sweep the reveals use, and for the same
      // reason: a jump scroll past this section is never reported by IO, and
      // a route that never draws leaves its four stops hidden for the visit.
      // `top < line` is true both on arrival and after being scrolled past.
      // On the wide layout the stops are zero-height anchors, which is exactly
      // the shape an observer is least reliable about — this covers them.
      let pending = targets.slice();
      let sweepFrame = 0;
      const sweep = () => {
        sweepFrame = 0;
        const vh = window.innerHeight;
        pending = pending.filter(([el, line]) => {
          if (el.getBoundingClientRect().top >= vh * line) return true;
          reach(el);
          unobserve(el);
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
      // Two frames, so the pre-draw state is painted before the drawn state
      // and the transition runs rather than being collapsed into it.
      const firstSweep = requestAnimationFrame(() => {
        requestAnimationFrame(sweep);
      });
      cleanups.push(() => {
        detachSweep();
        cancelAnimationFrame(firstSweep);
        if (sweepFrame) cancelAnimationFrame(sweepFrame);
      });
    }

    cleanups.push(attachStatic(root));

    return () => {
      cleanups.forEach((fn) => fn());
      delete doc.dataset.motion;
      delete doc.dataset.entered;
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
      // Round 14: 0.32 → 0.5 so a chapter takes the stage as its beat
      // crosses the middle of the viewport — roughly the stage's own middle —
      // instead of once it has climbed a third of the way up (owner: the
      // photo changed too late). Pairs with equal-height beats in the CSS.
      const targetY = headerClearance + (window.innerHeight - headerClearance) * 0.5;
      const rects = chapters.map((chapter) => chapter.getBoundingClientRect());
      let bestIndex = 0;
      rects.forEach((rect, index) => {
        if (rect.top <= targetY) bestIndex = index;
      });
      // Compare against the DOM as well as the cached index. The cache alone
      // would early-return on a re-entry where the element is freshly rendered
      // at its server default of 0 while `lastIndex` still holds the last
      // answer from before, which is how a back navigation used to land on the
      // right chapter's copy under the wrong photograph.
      if (bestIndex === lastIndex && stage.dataset.activeChapter === String(bestIndex)) return;
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
    // Back out of the site and in again and the page comes off the bfcache with
    // its scroll position restored but no effect re-run and no scroll event, so
    // the stage would hold whichever photograph it was showing when you left.
    window.addEventListener("pageshow", schedule);
    cleanups.push(() => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.removeEventListener("pageshow", schedule);
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
