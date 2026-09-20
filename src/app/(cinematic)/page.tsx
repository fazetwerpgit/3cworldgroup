import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import WorkChapters from "./_home/WorkChapters";
import RouteSequence from "./_home/RouteSequence";
import LocationExplorer from "./_home/LocationExplorer";
import { APPLY_HREF } from "../_cinematic/nav";
import kit from "../_cinematic/cinematic.module.css";
import styles from "./cinematic-home.module.css";

export const metadata: Metadata = {
  title: "Door-to-Door Sales Careers | 3C World Group",
  description:
    "Sell fiber internet, TV, and home security face to face in your own market. A 1099, commission-only role with real training and support. Apply to 3C World Group.",
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

const FAQS = [
  {
    q: "What is the job, day to day?",
    a: "Face-to-face sales in residential neighborhoods. You work an area on foot, knock, introduce yourself, find out what a household is paying for internet, TV or security, and offer something that fits. It is outdoor, conversational work, and the number of conversations you have is the part of it you control.",
  },
  {
    q: "What would I be selling?",
    a: "Fiber internet, TV service, and home security systems from the providers 3C represents — individually or bundled. These are established products people already recognize, not something you have to explain from scratch.",
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
    a: "No. 3C trains you on the products, the people, and the sales process, with hands-on coaching, roleplay, and support from experienced leaders — in the field, not only in a classroom or on a call.",
  },
  {
    q: "Where does 3C operate?",
    a: "3C works with communities across the country; the markets named on this page are Birmingham, Atlanta, Jacksonville, Lansing and Grand Rapids. Opportunities vary by market and change with client demand, so the honest answer for any specific city is a conversation.",
  },
];

export default function Home() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the opening frame                                            */}
      {/* ---------------------------------------------------------------- */}
      <section className={styles.hero} data-hero aria-labelledby="hero-title">
        <div className={styles.heroArt} data-hero-art>
          <Image
            src="/redesign/v2/photos/hero-wide-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.heroImageWide}
          />
          <Image
            src="/redesign/v2/photos/hero-portrait-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.heroImageTall}
          />
        </div>
        <div className={styles.heroScrim} aria-hidden="true" />

        <div className={styles.heroInner}>
          <h1 id="hero-title" className={styles.heroTitle}>
            <span className={styles.heroLine}>
              <span>Your next chapter</span>
            </span>
            <span className={styles.heroLine}>
              <span>starts at</span>
            </span>
            <span className={styles.heroLine}>
              <span className={styles.heroLime}>the next door.</span>
            </span>
          </h1>

          <p className={styles.heroLede}>
            Door-to-door sales in your own neighborhood — fiber internet, TV and home
            security, with the training to sell all three. 1099 independent contractor,
            commission-only, uncapped.
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
          <header className={kit.sectionHead} data-reveal>
            <h2 id="work-title" className={kit.sectionTitle}>
              Three things happen
              <br />
              at every door.
            </h2>
            <p className={kit.sectionLede}>
              Nobody hands you a script and a territory map and calls it a career. This is
              what the role is when you break it down — and what 3C trains you to do in
              each part of it.
            </p>
          </header>

          <WorkChapters />
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — the route: how you start                                     */}
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
              Four steps, in order. No part of this is a formality — the conversation is a
              real one, and the training happens before anyone sends you out.
            </p>
          </header>

          <RouteSequence />

          <p className={styles.routeFoot}>
            Timing depends on the market and on you.{" "}
            <Link href="/opportunities" className={kit.inlineLink}>
              The full career path
            </Link>{" "}
            goes into what comes after your first route.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — where                                                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="markets" className={styles.markets} aria-labelledby="markets-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="markets-title" className={kit.sectionTitle}>
              Pick the ground
              <br />
              you want to walk.
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
      {/* 5 — questions                                                    */}
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
              Six questions this role raises before anyone applies — the work itself, the
              products, how the pay works, contractor status, the training, and where 3C
              operates.
            </p>
          </header>

          <div className={styles.faqList}>
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
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 6 — two doors: rep, or team owner                                */}
      {/* ---------------------------------------------------------------- */}
      <section id="doors" className={styles.doors} aria-labelledby="doors-title">
        <div className={kit.shell}>
          <div className={styles.doorsLayout}>
            <div className={styles.doorsBody}>
              <h2 id="doors-title" className={styles.doorsTitle}>
                Two ways
                <br />
                <span className={styles.heroLime}>through the door.</span>
              </h2>

              <div className={`${styles.doorPrimary} ${kit.reveal}`} data-reveal>
                <p className={styles.doorKind}>Selling for yourself</p>
                <p className={styles.doorPitch}>
                  Work a route, get trained on the products, and be paid on what you close.
                </p>
                <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                  Apply
                  <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
                </Link>
              </div>

              <div className={styles.doorSecondary}>
                <p className={styles.doorKindQuiet}>Bring a team</p>
                <p className={styles.doorPitchQuiet}>
                  If you already lead a sales crew, that is a different conversation, and it
                  starts with a message rather than an application.
                </p>
                <Link href="/contact" className={kit.quietLink}>
                  Contact the team
                  <ArrowUpRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
                </Link>
              </div>
            </div>

            {/*
              A dusk street from the existing v2 set, under the hero's own
              two-layer scrim so the frame dissolves into the copy column instead
              of sitting in the navy as a pasted rectangle.
            */}
            <div className={styles.doorsArt} aria-hidden="true">
              <Image
                src="/redesign/v2/photos/fiber-dusk-1600.webp"
                alt=""
                fill
                sizes="(max-width: 900px) 100vw, 44vw"
                className={styles.doorsArtImage}
              />
              <div className={styles.doorsArtScrim} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 7 — closing                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="closing" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/v2/photos/hero-wide-1600.webp"
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
