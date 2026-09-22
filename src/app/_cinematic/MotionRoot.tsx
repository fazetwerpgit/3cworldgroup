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
 * Two more are about hydration rather than about motion, and so are set
 * whatever the reader's motion preference is. `data-hydrated` is written here
 * the moment this effect runs and says React arrived. `data-motion-bailed` is
 * written by the boot script when it did not arrive in time: motion is given
 * up on for good, and the header takes its legible backdrop rather than
 * waiting for a scroll handler that is never going to run.
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

    /*
      Proof that React got here, written on every path through this effect —
      motion, reduced motion, no IntersectionObserver, already bailed — because
      it answers a question none of those change: did hydration happen at all?

      The boot script's 1.5s timer reads it, and the site header's backdrop is
      keyed on the flag that timer leaves behind. It used to read `data-entered`
      instead, which is two animation frames later and is only ever set on the
      motion path, so a reader with reduced motion on could never have proved
      anything and a busy main thread could lose the race after React had
      already arrived. Set synchronously here, it says exactly what it means.

      Never removed: like `data-booted`, it is a fact about the document, not a
      state, and the cleanup below leaves it alone.
    */
    doc.dataset.hydrated = "true";

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

    /* --- Section reveals, once per page visit -------------------------------

       A section arrives when you first reach it, and then it has arrived.
       Scroll back up and down and nothing re-enacts itself.

       This is the owner's call and it is worth writing down, because the
       opposite was tried. Replaying every entrance on re-entry sounds livelier
       and reads worse: the copy you already know keeps re-introducing itself,
       and a page you are scanning up and down turns into a page that will not
       hold still. The route below is the one exception, and it earns it — the
       line drawing itself IS the content there, not an entrance onto it.

       An element shows once its top crosses 88% of the viewport, which is far
       enough up that the movement is over before it is properly in front of
       you. Nothing ever takes `data-shown` away.

       The decision comes from geometry rather than from a history of events —
       the same reasoning the chapter stage uses below. The observer and the
       listeners hold no logic; they only ask for another reading. So a jump
       scroll, a resize, an image landing and a restored scroll position all
       converge on one answer instead of each needing its own repair, and there
       is exactly one writer of `data-shown`.

       Because it is once, this work finishes: when the last section has
       arrived there is nothing left to decide, so the observer and the
       listeners are dropped rather than left running behind every scroll frame
       for the rest of the visit.
    */
    const SHOW_LINE = 0.88;

    /*
      Only what is still hidden. This effect re-runs — on every client-side
      navigation inside the group, and again whenever the reduced-motion switch
      is flipped — and each re-run walks a DOM where the sections that have
      already arrived still carry `data-shown`. Seeding the work from the full
      `[data-reveal]` list meant those were counted as pending and then skipped
      by the loop, so the counter could never reach zero and `stopReveals` below
      was unreachable: the observer and the scroll listener stayed live for the
      rest of the visit with nothing left to decide. Starting from the hidden set
      makes the count and the work the same list, and when that list is empty the
      guard below attaches nothing at all.
    */
    const reveals = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (el) => !el.dataset.shown,
    );
    if (reveals.length) {
      let revealFrame = 0;
      let pending = reveals.length;
      let stopReveals = () => {};

      const syncReveals = () => {
        revealFrame = 0;
        const vh = window.innerHeight;
        for (const el of reveals) {
          // Still needed: the list is fixed at attach time, so an element shown
          // in an earlier frame is walked again in this one.
          if (el.dataset.shown) continue;
          const rect = el.getBoundingClientRect();
          if (rect.bottom > 0 && rect.top < vh * SHOW_LINE) {
            el.dataset.shown = "true";
            pending -= 1;
          }
        }
        if (pending <= 0) stopReveals();
      };
      const scheduleReveals = () => {
        if (!revealFrame) revealFrame = requestAnimationFrame(syncReveals);
      };
      // The observer is here for the movements a scroll listener cannot see: an
      // image landing, an accordion opening, a font swap reflowing the column
      // above it.
      const io = new IntersectionObserver(scheduleReveals, {
        rootMargin: "0px",
        threshold: [0, 0.12],
      });
      reveals.forEach((el) => io.observe(el));
      window.addEventListener("scroll", scheduleReveals, { passive: true });
      window.addEventListener("resize", scheduleReveals);
      // Off the bfcache the scroll position is restored with no scroll event.
      window.addEventListener("pageshow", scheduleReveals);
      // Two frames, for the same reason the hero entrance waits: the gated
      // style has to be painted before the shown style, or the transition is
      // collapsed by one style recalculation and the entrance never runs.
      const firstReveal = requestAnimationFrame(() => {
        requestAnimationFrame(syncReveals);
      });
      // Idempotent: it is called both when the last section arrives and again
      // on unmount, and `cancelAnimationFrame` on a spent handle is harmless.
      stopReveals = () => {
        io.disconnect();
        window.removeEventListener("scroll", scheduleReveals);
        window.removeEventListener("resize", scheduleReveals);
        window.removeEventListener("pageshow", scheduleReveals);
      };
      cleanups.push(() => {
        stopReveals();
        cancelAnimationFrame(firstReveal);
        if (revealFrame) cancelAnimationFrame(revealFrame);
      });
    }

    /* --- The route: one triggered draw, not a scroll scrub -------------------

       The line used to scrub with the scroll position, which tied the pen to
       how fast a person happened to be moving: a flick drew all four blocks
       inside one frame, a slow read left the stroke stranded half-finished for
       a page of copy, and no stop could know when the line would reach it. It
       is a fixed-length draw that starts once per entry, so the stroke reads at
       the same speed every time and each stop derives its own delay from its
       fraction of the path (`--route-at`, see cinematic-home.module.css).

       Once per ENTRY, not once per visit: leave the section properly behind and
       the whole sequence is forgotten, so the pen draws again on the way back.
       What starts it is the drawing's own box, not the section's — the section
       opens on a pad and a two-line heading, some 240px of it, so a line
       measured on the section top fired while the canvas was still a full
       viewport below the fold. `[data-route-draw]` is the canvas itself.

       Forgetting is a snap, not a rewind, and that is load-bearing. Every
       attribute here is the ON half of a pair whose OFF half carries no
       `transition` at all, so taking one away returns the section to its
       pre-draw state within a frame instead of un-drawing it over 1.1s. It is
       why this needs no CSS hook of its own: a visible rewind would be the one
       thing worse than a stale drawing, and the reset only ever happens with
       the section off screen anyway.

       Both switches are wired at every width and the CSS decides which one
       applies, because a resize across 900px can land mid-sequence: the wide
       route follows one pen, the stacked rail advances step by step.
    */
    const routeSection = root.querySelector<HTMLElement>("[data-route-section]");
    if (routeSection) {
      const stops = Array.from(routeSection.querySelectorAll<HTMLElement>("[data-stop]"));
      const canvas = routeSection.querySelector<HTMLElement>("[data-route-draw]") ?? routeSection;
      // 0.55 for the canvas puts stop 01's row on screen as the pen leaves it;
      // 0.74 for a stacked step is the same line the rest of the page uses.
      const DRAW_LINE = 0.55;
      const STOP_LINE = 0.74;
      /*
        How far past an edge the drawing has to be before it is forgotten, as a
        fraction of the viewport. It is a distance rather than a hairline so
        that a section resting at the edge cannot be reset and redrawn over and
        over as the page settles by a pixel — the hysteresis IS the thrash
        guard, and 10% of the viewport is well clear of the 0.55 that starts
        the draw, so the two can never chase each other.

        Note the sign on the margin: it GROWS the observer's root rather than
        shrinking it. A negative margin would report the canvas as gone while
        it was still partly on screen, and that region overlaps the draw line,
        so the line would start and be forgotten alternately for as long as the
        reader sat there.
      */
      const REARM_PAD = 0.1;
      const REARM_MARGIN = `${REARM_PAD * 100}% 0px`;

      // The stacked rail only goes forward within one entry, so a reader moving
      // back up a step does not wind the line back with them.
      let rail = 0;
      const setRail = (value: number) => {
        rail = value;
        if (value > 0) routeSection.style.setProperty("--rail-progress", value.toFixed(4));
        else routeSection.style.removeProperty("--rail-progress");
      };

      let routeFrame = 0;
      const syncRoute = () => {
        routeFrame = 0;
        const vh = window.innerHeight;
        const pad = vh * REARM_PAD;
        const rect = canvas.getBoundingClientRect();
        if (rect.bottom < -pad || rect.top > vh + pad) {
          // Guarded like the reveals above: this runs every frame the section
          // is off screen, which is most of them.
          if (!routeSection.dataset.drawn && rail === 0) return;
          delete routeSection.dataset.drawn;
          stops.forEach((stop) => delete stop.dataset.arrived);
          setRail(0);
          return;
        }
        if (rect.top < vh * DRAW_LINE && !routeSection.dataset.drawn) {
          routeSection.dataset.drawn = "true";
        }
        for (const stop of stops) {
          if (stop.dataset.arrived) continue;
          if (stop.getBoundingClientRect().top >= vh * STOP_LINE) continue;
          stop.dataset.arrived = "true";
          const at = Number(stop.dataset.atSm ?? "0");
          if (at > rail) setRail(at);
        }
      };
      const scheduleRoute = () => {
        if (!routeFrame) routeFrame = requestAnimationFrame(syncRoute);
      };
      // On the wide layout the stops are zero-height anchors, which is the shape
      // an observer is least reliable about — hence the geometry pass above and
      // an observer whose only job is to wake it.
      const io = new IntersectionObserver(scheduleRoute, { rootMargin: REARM_MARGIN, threshold: 0 });
      io.observe(canvas);
      stops.forEach((stop) => io.observe(stop));
      window.addEventListener("scroll", scheduleRoute, { passive: true });
      window.addEventListener("resize", scheduleRoute);
      window.addEventListener("pageshow", scheduleRoute);
      // Two frames, so the pre-draw state is painted before the drawn state
      // and the transition runs rather than being collapsed into it.
      const firstRoute = requestAnimationFrame(() => {
        requestAnimationFrame(syncRoute);
      });
      cleanups.push(() => {
        io.disconnect();
        window.removeEventListener("scroll", scheduleRoute);
        window.removeEventListener("resize", scheduleRoute);
        window.removeEventListener("pageshow", scheduleRoute);
        cancelAnimationFrame(firstRoute);
        if (routeFrame) cancelAnimationFrame(routeFrame);
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
      /*
        Round 16 — the reading line is a band, not a hairline.

        The rule is still "the last chapter whose top has crossed the line",
        but a chapter has to cross 24px PAST the line to take the stage and
        24px back before it gives it up. A single line meant a chapter top
        resting within a pixel of it could hand the stage back and forth as
        the page settled, a scrollbar appeared, or a trackpad idled — two
        photographs trading places over a 1px movement. Nothing at all
        happens inside the band, which is the whole point of having one.
      */
      const BAND = 24;
      const rects = chapters.map((chapter) => chapter.getBoundingClientRect());
      let bestIndex = 0;
      rects.forEach((rect, index) => {
        // Ahead of where we already are, the line is the far edge of the band;
        // at or behind it, the near edge. So the chapter in possession keeps it
        // until the reader has clearly moved on.
        const line = index > lastIndex ? targetY - BAND : targetY + BAND;
        if (rect.top <= line) bestIndex = index;
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
        if (index === bestIndex) {
          chapter.dataset.current = "true";
          delete chapter.dataset.idle;
        } else {
          delete chapter.dataset.current;
          // The stylesheet dims an idle chapter's number, and it keys on this
          // rather than on "not current" so that a page with no script running
          // leaves all three numbers alone instead of dimming every one of
          // them. Nothing carries either attribute until this line runs.
          chapter.dataset.idle = "true";
        }
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
