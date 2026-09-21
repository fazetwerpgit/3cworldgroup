import Image, { getImageProps } from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import WorkChapters from "./_home/WorkChapters";
import RouteSequence from "./_home/RouteSequence";
import LocationExplorer from "./_home/LocationExplorer";
import Faq from "./_home/Faq";
import { APPLY_HREF } from "../_cinematic/nav";
import kit from "../_cinematic/cinematic.module.css";
import styles from "./cinematic-home.module.css";

/*
  The hero's two crops, resolved to plain <img> attributes rather than to
  elements. `priority` still comes through as `loading="eager"` and
  `fetchPriority="high"` on whichever one the browser picks; see the <picture>
  in the markup for why they are not two <Image> elements.
*/
const HERO_ART = {
  alt: "",
  fill: true,
  priority: true,
  sizes: "100vw",
} as const;

const { props: heroWide } = getImageProps({
  ...HERO_ART,
  src: "/redesign/v2/photos/src/hero-wide.png",
});

const { props: heroTall } = getImageProps({
  ...HERO_ART,
  src: "/redesign/v2/photos/hero-portrait-1600.webp",
});

/*
  No `<link rel="preload">` for either crop, and that is a measured decision
  rather than an omission. A media-scoped preload pair was tried and made no
  difference: six cold loads each way put the median Largest Contentful Paint
  at 168ms against 180ms at 1440x900 and 160ms against 156ms at 390x844 — the
  spread between runs is wider than the gap, and the desktop number came out
  marginally worse with the preload than without it.

  That is the expected result. The <img> is server-rendered near the top of the
  document with fetchpriority="high", so the browser's preload scanner meets it
  in the same pass that would have met the link. A preload earns its place when
  the image is discovered late — behind a client render, a CSS background, or a
  script. This one is not.
*/

export const metadata: Metadata = {
  title: "Door-to-Door Sales Careers | 3C World Group",
  description:
    "Sell fiber internet, TV, and home security face to face. A 1099, commission-only role with real training and support. Apply to 3C World Group.",
};

/**
 * The only page in the group that opens on a photograph. `[data-hero]` on the
 * opening section is what tells SiteHeader to stay transparent until you scroll
 * past it; an interior page opens on `kit.pageHead` instead, and the header is
 * condensed from the first paint.
 *
 * The chrome, the motion root and the `.page` element are all in
 * src/app/(cinematic)/layout.tsx. This file is sections.
 */

/* Every line here restates something already on the site: the careers list,
   the route steps, or the apply page. Nothing is promised here that is not
   promised there. */
const WHY = [
  ["Uncapped pay", "Commission is uncapped. Your effort drives your earnings, and top performers earn more."],
  ["Training first", "You learn the products and the sales process from people who sell them, before anyone sends you out."],
  ["Field support", "Your first route is worked with your team and a leader who has worked one, not from a classroom."],
  ["Your schedule", "You set your hours. It is independent contractor work, paid on commission."],
] as const;

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the opening frame                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className={styles.hero} data-hero aria-labelledby="hero-title">
        <div className={styles.heroArt} data-hero-art>
          {/*
            One element, two photographs, and only one of them is ever
            downloaded.

            This used to be two `next/image` fills with the unwanted one hidden
            in CSS, which is the trap the glow layer below had already written
            down: `display: none` does not stop a browser fetching a `srcset`,
            and `priority` made it worse by preloading both. Every desktop
            visitor paid for the portrait crop and every phone paid for the
            wide one.

            `getImageProps` gives the same optimised `srcset` the component
            would have built — same widths, same formats, same loader — without
            mounting an element, so the choice can be handed to `<picture>`
            instead. The browser evaluates the media queries BEFORE it fetches
            and requests exactly one. The breakpoint is written as the CSS
            writes it (max-width: 900px, see .heroImage below), because the two
            have to agree: a picture that switched at a different width than
            the object-position would crop the wrong photograph.

            Both are full-bleed at the width where they are shown, so both
            keep `sizes="100vw"`. What differs is the crop, and that stays in
            CSS where it was.
          */}
          <picture>
            <source media="(max-width: 900px)" srcSet={heroTall.srcSet} sizes={heroTall.sizes} />
            {/*
              `priority` survives the trip through getImageProps as an eager
              load, but the rendered tag carries no `fetchpriority`, so it is
              set here rather than assumed: this photograph is the Largest
              Contentful Paint at every width and must be requested ahead of
              the rest of the page. `loading="eager"` is spelled out for the
              same reason — it is the default, and a default is not a promise.
            */}
            <img
              {...heroWide}
              alt=""
              className={styles.heroImage}
              fetchPriority="high"
              loading="eager"
            />
          </picture>
          {/*
            The lit roads of this same photograph, lifted into their own
            transparent layer and revealed under the pointer. It is a child of
            .heroArt so it rides the drift transform and stays registered to
            the frame pixel for pixel; the file itself is a CSS background
            declared inside the desktop media query, because a second
            next/image in a display:none box is still fetched and a 300KB
            decoration must never reach a phone — the same reason the
            photograph above it is one `<picture>` rather than two images.
          */}
          <div className={styles.heroGlow} aria-hidden="true" />
        </div>
        <div className={styles.heroScrim} aria-hidden="true" />

        <div className={styles.heroInner}>
          <h1 id="hero-title" className={styles.heroTitle}>
            <span className={styles.heroLine}>
              <span>Your next chapter</span>
            </span>
            <span className={styles.heroLine}>
              <span className={styles.heroLime}>starts next door.</span>
            </span>
          </h1>

          <p className={styles.heroLede}>
            Door-to-door sales for fiber internet, TV and home security, with training to sell
            all three. 1099 independent contractor, commission-only, uncapped.
          </p>

          <div className={styles.heroActions}>
            <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
              Apply to sell with 3C
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
            </Link>
            <a href="#the-work" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
              See the work
            </a>
          </div>
        </div>

        <div className={styles.heroRail} aria-hidden="true">
          <span>The conversation</span>
          <span>The right fit</span>
          <span>The follow-through</span>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — what the work actually is                                    */}
      {/* ---------------------------------------------------------------- */}
      <section id="the-work" className={styles.work} aria-labelledby="work-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="work-title" className={kit.sectionTitleInk}>
              Three things happen
              <br />
              at every door.
            </h2>
            <p className={kit.sectionLedeInk}>
              You meet people, understand what they need, and explain a useful next step.
              3C trains you through each part of that conversation.
            </p>
          </header>

          <WorkChapters />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — why people sell with 3C                                      */}
      {/* ---------------------------------------------------------------- */}
      {/*
        Four facts, each already stated elsewhere on the site (the careers
        list, the route steps, the apply page) and confirmed by the owner on
        2026-09-21. Sits right after the work chapters and before the route,
        so the reason to apply comes before the steps to do it (moved up from
        below the FAQ, 2026-09-21 evening). No Apply button here: the route
        foot below carries a quiet link and the closer carries the button.
        The team line replaces the old second card.
      */}
      <section id="why" className={styles.why} aria-labelledby="why-title">
        <div className={kit.shell}>
          {/*
            Four reasons as a typographic grid: a lime term over a one-line
            fact, no rules, no cards, no icons. The FAQ further down is a
            hairline row stack, so this block deliberately is not one.
          */}
          <div className={styles.whyLayout}>
            <div className={styles.whyHead}>
              <h2 id="why-title" className={styles.whyTitle}>
                Why people
                <br />
                <span className={styles.heroLime}>sell with 3C.</span>
              </h2>

              <p className={styles.whyTeam}>
                Already lead a sales crew? That is a different conversation, and it starts with a
                message rather than an application.{" "}
                <Link href="/contact" className={kit.inlineLink}>
                  Contact the team
                </Link>
              </p>
            </div>

            <div className={styles.whyBody}>
              <dl className={styles.whyList}>
                {WHY.map(([term, fact]) => (
                  <div key={term} className={`${styles.whyItem} ${kit.revealRise}`} data-reveal>
                    <dt className={styles.whyTerm}>{term}</dt>
                    <dd className={styles.whyFact}>{fact}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — the route: how you start                                     */}
      {/* ---------------------------------------------------------------- */}
      <section id="start" className={styles.routeSection} data-route-section aria-labelledby="start-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="start-title" className={kit.sectionTitleInk}>
              From application
              <br />
              to your first route.
            </h2>
            <p className={kit.sectionLedeInk}>
              Four steps, in order. No part of this is a formality. The conversation is a
              real one, and the training happens before anyone sends you out.
            </p>
          </header>

          <RouteSequence />

          {/*
            The foot joins the timing note and a quiet apply link on one
            hairline. Not a lime button: the hero above and the closer below
            carry this page's two Apply buttons, and a third one here made the
            page ask four times.
          */}
          <div className={styles.routeFoot}>
            <p className={styles.routeFootNote}>
              Timing depends on the market and on you.{" "}
              <Link href="/opportunities" className={kit.inlineLink}>
                The full career path
              </Link>{" "}
              goes into what comes after your first route.
            </p>
            <div className={styles.routeFootCta}>
              <Link href={APPLY_HREF} className={kit.quietLinkInk}>
                Apply to sell with 3C
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 5 — where                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="markets" className={styles.markets} aria-labelledby="markets-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="markets-title" className={kit.sectionTitle}>
              Find your market.
            </h2>
            <p className={kit.sectionLede}>
              These are markets where 3C teams work. Pick the one you would want to walk,
              and name it when you apply. What is open anywhere changes with client demand.
            </p>
          </header>

          <LocationExplorer />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 6 — questions                                                    */}
      {/* ---------------------------------------------------------------- */}
      <section id="questions" className={styles.faq} aria-labelledby="faq-title">
        <div className={kit.shell}>
          {/*
            Same grid as every other section on the page: display heading in the
            left column, supporting lede in the right, content beneath across the
            full width. Round 2 put this block in a narrow shell of its own, which
            left the right quarter of the section empty at 1440 and broke the
            page's own rhythm.
          */}
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="faq-title" className={kit.sectionTitleInk}>
              Straight
              <br />
              answers.
            </h2>
            <p className={kit.sectionLedeInk}>
              Six questions this role raises before anyone applies: the work itself, the
              products, how the pay works, contractor status, the training, and where 3C
              operates.
            </p>
          </header>

          <Faq />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 7 — closing                                                      */}
      {/* ---------------------------------------------------------------- */}
      {/*
        From inside a dark hallway, looking out through the open front door at
        the lit street: the headline read as a picture, from the side of the
        door you step out of. Chapter 02 above looks INTO a living room from
        the open door; this one looks OUT of one, which is the other half of
        the same threshold and the note the page ends on.
      */}
      <section id="closing" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/cinematic/home-doorway-dusk-1920.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={styles.closingInner}>
          <h2 id="closing-title" className={styles.closingTitle}>
            The route starts
            <br />
            <span className={styles.heroLime}>when you do.</span>
          </h2>
          <p className={styles.closingLede}>
            Tell us where you want to work and what you are looking for. It starts with the
            application.
          </p>
          <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Apply to sell with 3C
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </Link>
        </div>
      </section>

      {/*
        Compact apply affordance — appears once the hero is behind you, which is
        exactly why it is this page's and not the kit's: MotionRoot keys it to
        `[data-hero]`, and no interior page has one. It is `position: fixed` at
        ≤900px and `display: none` above it, so it takes no part in the flow
        either way. `data-apply-bar` is both what MotionRoot watches and what
        tells the footer to reserve space for it.
      */}
      <div className={styles.applyBar} data-apply-bar>
        <span>Door-to-door sales · 1099, commission-only</span>
        <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnSm}`}>
          Apply
          <ArrowRight aria-hidden="true" className={kit.btnArrow} size={15} strokeWidth={2.2} />
        </Link>
      </div>
    </>
  );
}
