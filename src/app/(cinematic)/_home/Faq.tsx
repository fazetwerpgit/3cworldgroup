"use client";

import { useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import styles from "../cinematic-home.module.css";

/**
 * Six questions this role raises before anyone applies. Native
 * <details>/<summary> — not button + aria-expanded — so the keyboard, the
 * accessibility tree and find-in-page all come from the browser rather than
 * from us.
 *
 * The markup ships with name="home-faq", which makes the browser enforce
 * one-open-at-a-time for a reader with no JavaScript. Once this component
 * mounts it takes the attribute off again: with `name` in place the browser
 * slams a sibling shut the instant another opens, which would cut the closing
 * row's animation in half. Exclusivity is then ours to enforce, and the row
 * that closes gets the same 220ms as the row that opens.
 */
const FAQS = [
  {
    q: "What is the job, day to day?",
    a: "Face-to-face sales in residential neighborhoods. You work an area on foot, knock, introduce yourself, find out what a household is paying for internet, TV or security, and offer something that fits. It is outdoor, conversational work, and the number of conversations you have is the part of it you control.",
  },
  {
    q: "What would I be selling?",
    a: "Fiber internet, TV service, and home security systems from the providers 3C represents, individually or bundled. These are established products people already recognize, not something you have to explain from scratch.",
  },
  {
    q: "How does the pay work?",
    a: "This is a commission-only role with uncapped earnings. Your effort drives what you make, and top performers earn more. There is no salary component, so it suits people who want their income tied to their own activity.",
  },
  {
    q: "Am I an employee or a contractor?",
    a: "A 1099 independent contractor. You sign an independent contractor agreement that sets out compensation and scope, and you are responsible for your own taxes as a contractor.",
  },
  {
    q: "Do I need sales experience?",
    a: "No. 3C trains you on the products, the people, and the sales process, with hands-on coaching, roleplay, and support from experienced leaders in the field, not only in a classroom or on a call.",
  },
  {
    q: "Where does 3C operate?",
    a: "3C works with communities across the country; the markets named on this page are Dallas, Houston, Southern California, Lansing and Grand Rapids. Opportunities vary by market and change with client demand, so the honest answer for any specific city is a conversation.",
  },
];

/** Matches the mark's rotation in cinematic-home.module.css (.faqMark). */
const DURATION = 220;

function easeOutExpo(el: Element) {
  return (
    getComputedStyle(el).getPropertyValue("--ease-out-expo").trim() ||
    "cubic-bezier(0.16, 1, 0.3, 1)"
  );
}

export default function Faq() {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;

    const rows = () => Array.from(list.querySelectorAll<HTMLDetailsElement>("details"));

    // See the component note: the browser's own exclusivity is for readers
    // without JavaScript, and it fights the animation once we have JavaScript.
    for (const row of rows()) row.removeAttribute("name");

    /** The animation in flight, and the state it is heading for. */
    const running = new WeakMap<HTMLDetailsElement, Animation>();
    const intent = new WeakMap<HTMLDetailsElement, boolean>();
    const target = (row: HTMLDetailsElement) => intent.get(row) ?? row.open;

    const settle = (row: HTMLDetailsElement, open: boolean) => {
      row.open = open;
      row.dataset.open = String(open);
      // Inline height is cleared every time, so a long answer is never clipped
      // at a stale measurement and a closed row leaves no reserved space.
      row.style.height = "";
      row.style.overflow = "";
    };

    const toggle = (row: HTMLDetailsElement, open: boolean) => {
      intent.set(row, open);
      // The mark turns with the height, not after it. `open` has to stay true
      // through a close so the answer is readable on the way out, so the CSS
      // reads this instead and gets the target state the moment you click.
      row.dataset.open = String(open);

      // Read where the row is now — mid-animation height included — before
      // cancelling, or the cancel reverts the height under the measurement.
      const startHeight = row.getBoundingClientRect().height;
      const previous = running.get(row);
      if (previous) {
        running.delete(row);
        previous.cancel();
      }

      if (typeof row.animate !== "function" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        settle(row, open);
        return;
      }

      // The answer has to stay laid out for both directions: opening measures
      // the height it is heading to, closing keeps it readable on the way out.
      row.open = true;
      row.style.overflow = "hidden";
      row.style.height = "";
      let endHeight = row.getBoundingClientRect().height;
      if (!open) {
        row.open = false;
        endHeight = row.getBoundingClientRect().height;
        row.open = true;
      }
      row.style.height = `${startHeight}px`;

      if (Math.abs(endHeight - startHeight) < 1) {
        settle(row, open);
        return;
      }

      const animation = row.animate(
        { height: [`${startHeight}px`, `${endHeight}px`] },
        { duration: DURATION, easing: easeOutExpo(row) },
      );
      running.set(row, animation);
      animation.addEventListener("finish", () => {
        if (running.get(row) !== animation) return;
        running.delete(row);
        settle(row, open);
      });
    };

    // Delegated, so Enter and Space on a focused summary arrive here too: the
    // browser dispatches them as clicks on the summary.
    const onClick = (event: MouseEvent) => {
      const summary = (event.target as HTMLElement | null)?.closest("summary");
      if (!summary || !list.contains(summary)) return;
      const row = summary.parentElement;
      if (!(row instanceof HTMLDetailsElement)) return;
      event.preventDefault();

      const next = !target(row);
      if (next) {
        for (const other of rows()) {
          if (other !== row && target(other)) toggle(other, false);
        }
      }
      toggle(row, next);
    };

    list.addEventListener("click", onClick);
    return () => {
      list.removeEventListener("click", onClick);
      for (const row of rows()) {
        running.get(row)?.cancel();
        row.style.height = "";
        row.style.overflow = "";
      }
    };
  }, []);

  return (
    <div ref={listRef} className={styles.faqList}>
      {FAQS.map((item) => (
        <details key={item.q} className={styles.faqItem} name="home-faq">
          <summary className={styles.faqSummary}>
            <span>{item.q}</span>
            <Plus aria-hidden="true" className={styles.faqMark} size={20} strokeWidth={2} />
          </summary>
          <div className={styles.faqBody}>
            <p>{item.a}</p>
          </div>
        </details>
      ))}
    </div>
  );
}
