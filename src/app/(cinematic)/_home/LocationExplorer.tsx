"use client";

import Image from "next/image";
import Link from "next/link";
import { useRef, useState } from "react";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "../cinematic-home.module.css";

/**
 * The five markets 3C's existing homepage already names, with the skyline art
 * that already ships in /public/redesign. Selecting a city changes the picture
 * and the selected market shown in the panel — nothing more. It does not
 * reserve, route or pre-fill an application.
 *
 * Deliberately no per-city blurb: nothing in this codebase establishes anything
 * about recruiting, territory, density or build-out in any of these cities, and
 * invented geography does not help anyone decide whether to apply. The panel
 * says the one true thing — openings change with client demand — and lets the
 * reader name the market they want.
 */
const MARKETS = [
  { city: "Birmingham", state: "Alabama", image: "/redesign/home-r6-market-birmingham-hd.png" },
  { city: "Atlanta", state: "Georgia", image: "/redesign/home-r5-market-atlanta-hd.png" },
  { city: "Jacksonville", state: "Florida", image: "/redesign/home-r5-market-jacksonville-hd.png" },
  { city: "Lansing", state: "Michigan", image: "/redesign/home-r7-market-lansing-hd.png" },
  { city: "Grand Rapids", state: "Michigan", image: "/redesign/home-r7-market-grand-rapids-hd.png" },
] as const;

export default function LocationExplorer() {
  const [index, setIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const active = MARKETS[index];

  // Left/right (and up/down) walk the list, selection following focus. The step
  // is taken from the button the user is actually focused on, not from the
  // current selection: every chip is its own tab stop, so a reader can tab onto
  // a chip they have not selected, and stepping from the selection would jump
  // somewhere they are not looking.
  // A5 — Home and End jump to the ends of the list, which is what a reader who
  // has learned the arrow keys here will try next.
  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
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

  return (
    <div className={styles.explorer}>
      <div ref={listRef} className={styles.cityList} role="group" aria-label="Markets" onKeyDown={onKeyDown}>
        {MARKETS.map((market, i) => (
          <button
            key={market.city}
            type="button"
            className={styles.cityChip}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            <span className={styles.cityChipName}>{market.city}</span>
            <span className={styles.cityChipState}>{market.state}</span>
          </button>
        ))}
      </div>

      <div className={styles.cityPlate}>
        <div className={styles.cityPlateArt}>
          {MARKETS.map((market, i) => (
            <Image
              key={market.city}
              src={market.image}
              alt={`${market.city}, ${market.state}`}
              fill
              sizes="(max-width: 900px) 100vw, 46vw"
              className={styles.cityPlateImage}
              data-active={i === index || undefined}
              aria-hidden={i !== index}
            />
          ))}
        </div>

        <div className={styles.cityPlateBody} aria-live="polite">
          <p className={styles.cityPlateState}>{active.state}</p>
          <h3 className={styles.cityPlateName}>{active.city}</h3>
          <p className={styles.cityPlateNote}>
            Choose your preferred market. Openings vary with client demand.
          </p>
          <p className={styles.cityPlateStep}>
            Interested in working in {active.city}? Include your preferred location when
            you apply.
          </p>
          <div className={styles.cityPlateActions}>
            <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime}`}>
              Apply <ArrowRight aria-hidden="true" className={kit.btnArrow} size={17} strokeWidth={2.2} />
            </Link>
            <Link href="/opportunities" className={kit.quietLink}>
              See the career path <ArrowRight aria-hidden="true" className={kit.btnArrow} size={15} strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
