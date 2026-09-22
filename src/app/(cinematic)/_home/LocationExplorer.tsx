"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { MARKETS, applyHrefForMarket } from "../../_cinematic/markets";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "../cinematic-home.module.css";

/**
 * The five markets the site names, with the market art that ships for each in
 * /public/redesign/v2/photos. Selecting one changes the picture and the market
 * shown in the panel, and points that panel's Apply link at /apply with the
 * market named, so the form opens with the City field already filled in.
 *
 * The list itself lives in _cinematic/markets.ts because /apply reads the same
 * list to resolve `?market=`. Per-market copy is geography only: nothing in
 * this codebase establishes territory, density or build-out anywhere, so the
 * panel pairs the place with the one sourced line — openings change with
 * client demand — and lets the reader name the market they want.
 */

/** Matches the bar's own height in cinematic-home.module.css (.cityIndicator). */
const INDICATOR_HEIGHT = 2;
const BODY_ENTRANCE_MS = 200;
/** Matches the image's opacity transition in cinematic-home.module.css. */
const CROSSFADE_MS = 460;
/** Longest the crossfade waits for a market's bytes before starting anyway. */
const LOAD_WAIT_MS = 500;

/** The kit's easing token, read off the element so there is one source for it. */
function easeOutExpo(el: Element) {
  return (
    getComputedStyle(el).getPropertyValue("--ease-out-expo").trim() ||
    "cubic-bezier(0.16, 1, 0.3, 1)"
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function LocationExplorer() {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const bodyAnimation = useRef<Animation | null>(null);
  // The selection the observers read, and the selection the entrance last ran
  // for. The second is why StrictMode's double-invoked effect cannot fire a
  // spurious entrance on mount: the index has not changed between the runs.
  const indexRef = useRef(index);
  const measureRef = useRef<() => void>(() => {});
  const animatedFor = useRef(index);
  const active = MARKETS[index];

  /*
    Only the market you are looking at is in the DOM, plus the one it is fading
    away from. Rendering all five downloaded five skyline photographs on every
    visit to show one. `mounted` is kept in recency order, so the incoming frame
    is appended last and therefore paints over the outgoing one, and React never
    has to reorder a node that is mid-transition. `shown` lags it by two frames:
    the newcomer has to be painted transparent before it is told to be opaque,
    or there is nothing for the crossfade to start from.
  */
  const [mounted, setMounted] = useState<readonly number[]>([0]);
  const [shown, setShown] = useState(0);
  const shownRef = useRef(0);
  const loadedRef = useRef(new Set<number>());
  const waitingRef = useRef<{ index: number; reveal: () => void } | null>(null);

  const noteLoaded = (i: number) => {
    loadedRef.current.add(i);
    const waiting = waitingRef.current;
    if (waiting?.index === i) {
      waitingRef.current = null;
      waiting.reveal();
    }
  };

  // Left and right walk the list, selection following focus. The step is taken
  // from the button the user is actually focused on, not from the current
  // selection: every chip is its own tab stop, so a reader can tab onto a chip
  // they have not selected, and stepping from the selection would jump
  // somewhere they are not looking.
  // A5 — Home and End jump to the ends of the list, which is what a reader who
  // has learned the arrow keys here will try next.
  // Up and down are deliberately left alone. This is a plain group, not a
  // listbox, so nothing tells the reader the vertical arrows belong to it, and
  // swallowing them would stop the page scrolling the moment focus reached a
  // chip.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const jump = event.key === "Home" ? 0 : event.key === "End" ? MARKETS.length - 1 : -1;
    if (!step && jump < 0) return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
    const focused = (event.target as HTMLElement).closest("button");
    const from = focused ? buttons.indexOf(focused as HTMLButtonElement) : -1;
    if (from < 0) return;
    event.preventDefault();
    const next = jump >= 0 ? jump : (from + step + MARKETS.length) % MARKETS.length;
    setIndex(next);
    buttons[next]?.focus();
  };

  /*
    One lime bar that measures the selected chip and slides, instead of five
    borders blinking on and off. Measurement is geometric (offsetLeft/offsetTop
    /offsetWidth against the positioned list), so it follows the grid through
    both breakpoints on its own: five columns, two columns at 900, one stacked
    column at 560, where it simply travels vertically instead. The bar is
    display:none until this runs, so a server render or a JS-off reader keeps
    the chip's own lime edge and never sees a bar parked at the origin — and
    coming out of display:none means the first placement cannot transition in
    from nowhere.
  */
  // Mount-only: the observer, the listener and the font subscription are set
  // up once and read the live selection off a ref. Keying this on the index
  // would tear all three down and rebuild them on every click.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const measure = () => {
      const chip = list.querySelectorAll<HTMLButtonElement>("button")[indexRef.current];
      if (!chip) return;
      list.style.setProperty("--market-indicator-x", `${chip.offsetLeft}px`);
      list.style.setProperty("--market-indicator-y", `${chip.offsetTop + chip.offsetHeight - INDICATOR_HEIGHT}px`);
      list.style.setProperty("--market-indicator-w", `${chip.offsetWidth}px`);
      list.dataset.indicator = "ready";
    };
    measureRef.current = measure;
    measure();

    // Resize covers the breakpoints; the observer also catches the reflow when
    // the display face finally loads and every chip changes height.
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(list);
    window.addEventListener("resize", measure);

    let live = true;
    document.fonts?.ready
      .then(() => {
        if (live) measure();
      })
      .catch(() => {});

    return () => {
      live = false;
      observer?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  useEffect(() => {
    indexRef.current = index;
    measureRef.current();
  }, [index]);

  // Mount the incoming frame beside the one on screen, then reveal it once its
  // bytes are in: fading up over a picture that has not arrived would show the
  // empty frame, which is worse than the extra beat.
  useEffect(() => {
    setMounted((prev) => {
      const outgoing = shownRef.current;
      if (outgoing === index) {
        return prev.length === 1 && prev[0] === index ? prev : [index];
      }
      return prev.length === 2 && prev[0] === outgoing && prev[1] === index ? prev : [outgoing, index];
    });

    let cancelled = false;
    let first = 0;
    let second = 0;
    const reveal = () => {
      if (cancelled) return;
      first = requestAnimationFrame(() => {
        second = requestAnimationFrame(() => {
          if (cancelled) return;
          shownRef.current = index;
          setShown(index);
        });
      });
    };

    let cap = 0;
    if (loadedRef.current.has(index)) {
      reveal();
    } else {
      waitingRef.current = { index, reveal };
      cap = window.setTimeout(reveal, LOAD_WAIT_MS);
    }

    return () => {
      cancelled = true;
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
      if (cap) window.clearTimeout(cap);
      if (waitingRef.current?.index === index) waitingRef.current = null;
    };
  }, [index]);

  // The outgoing frame leaves only once the crossfade that needed it is over.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setMounted((prev) => (prev.length === 1 && prev[0] === shown ? prev : [shown]));
    }, CROSSFADE_MS);
    return () => window.clearTimeout(timer);
  }, [shown]);

  /*
    The panel swaps instantly — the copy is already correct the frame you click
    — and then rises the last few pixels into place. Any entrance still running
    is cancelled first, so holding down an arrow key does not stack five
    animations on top of each other.
  */
  useEffect(() => {
    if (animatedFor.current === index) return;
    animatedFor.current = index;
    const panel = panelRefs.current[index];
    if (!panel || typeof panel.animate !== "function" || prefersReducedMotion()) return;
    bodyAnimation.current?.cancel();
    bodyAnimation.current = panel.animate(
      [
        { opacity: 0, transform: "translateY(8px)" },
        { opacity: 1, transform: "translateY(0)" },
      ],
      { duration: BODY_ENTRANCE_MS, easing: easeOutExpo(panel), fill: "none" },
    );
  }, [index]);

  return (
    <div className={styles.explorer}>
      <div ref={listRef} className={styles.cityList} role="group" aria-label="Markets" onKeyDown={onKeyDown}>
        {MARKETS.map((market, i) => (
          <button
            key={market.slug}
            type="button"
            className={styles.cityChip}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <span className={styles.cityChipName}>{market.name}</span>
            <span className={styles.cityChipState}>{market.region}</span>
          </button>
        ))}
        <span className={styles.cityIndicator} aria-hidden="true" />
      </div>

      {/*
        The five panels below are permanent — selection only flips
        visibility — so there is no text change for a live region on that
        container to announce. This node is the announcement: its content is
        the one thing that actually changes when you pick a market.
      */}
      <p className={kit.srOnly} role="status" aria-live="polite">
        {active.label} selected
      </p>

      <div className={styles.cityPlate}>
        {/*
          alt="" is the whole accessibility story here: the photograph repeats
          the market name the panel beside it already carries. That implicit
          presentation role is also why the image takes no aria-* of its own —
          a decorative element that then declares aria-hidden is a conflict axe
          fails on, and there is nothing to hide that alt="" has not hidden.
        */}
        <div className={styles.cityPlateArt}>
          {mounted.map((i) => (
            <Image
              key={MARKETS[i].slug}
              src={MARKETS[i].image}
              alt=""
              fill
              sizes="(max-width: 900px) 100vw, 46vw"
              className={styles.cityPlateImage}
              data-active={i === shown || undefined}
              onLoad={() => noteLoaded(i)}
              onError={() => noteLoaded(i)}
            />
          ))}
        </div>

        {/*
          All five panels are stacked in one grid cell, so the plate is always
          as tall as the tallest market and the page never jumps when you move
          between a one-word city and a two-word one. The inactive four are
          visibility:hidden, which keeps their links out of the tab order and
          their headings out of the accessibility tree while they still hold
          the height open.
        */}
        <div className={styles.cityPlateBody}>
          {MARKETS.map((market, i) => (
            <div
              key={market.slug}
              ref={(el) => {
                panelRefs.current[i] = el;
              }}
              className={styles.cityPlatePanel}
              data-active={i === index || undefined}
              aria-hidden={i !== index}
            >
              <p className={styles.cityPlateState}>{market.region}</p>
              <h3 className={styles.cityPlateName}>{market.name}</h3>
              <p className={styles.cityPlateNote}>
                {market.note} Openings vary with client demand.
              </p>
              <p className={styles.cityPlateStep}>
                Interested in working in {market.name}? The form names this market for
                you, and you can change it.
              </p>
              {/* Quiet links, not a lime button: the closer one section down carries
                  the page's last Apply, and a button here made Home ask four times. */}
              <div className={styles.cityPlateActions}>
                <Link href={applyHrefForMarket(market.slug)} className={kit.quietLink}>
                  Apply for this market <ArrowRight aria-hidden="true" className={kit.btnArrow} size={15} strokeWidth={2.2} />
                </Link>
                <Link href="/opportunities" className={kit.quietLink}>
                  See the career path <ArrowRight aria-hidden="true" className={kit.btnArrow} size={15} strokeWidth={2.2} />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
