import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight, Plus } from "lucide-react";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import MotionRoot from "./_cinematic/MotionRoot";
import SiteHeader from "./_cinematic/SiteHeader";
import WorkChapters from "./_cinematic/WorkChapters";
import RouteSequence from "./_cinematic/RouteSequence";
import LocationExplorer from "./_cinematic/LocationExplorer";
import { APPLY_HREF, NAV_LINKS } from "./_cinematic/nav";
import styles from "./cinematic-home.module.css";

export const metadata: Metadata = {
  title: "Door-to-Door Sales Careers | 3C World Group",
  description:
    "Sell fiber internet, TV, and home security face to face in your own market. A 1099, commission-only role with real training and support. Apply to 3C World Group.",
};

/**
 * The homepage deliberately does not use PageWrapper. It renders its own
 * header and footer so it sits outside the `.public-site` cascade in
 * public.css, which is left untouched and still drives every other route.
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
    <MotionRoot>
      <div className={styles.page}>
        {/*
          The header starts transparent over the hero photograph and only takes
          on its navy backdrop once SiteHeader's scroll listener sets
          `data-condensed`. With scripting off that listener never runs, so a
          fixed header of white text would sit unreadable over the two paper
          sections. Give it the backdrop up front in that case — the only thing
          lost is the transparent opening, and legibility is not negotiable.
        */}
        <noscript>
          <style>{`.${styles.header}{background:rgba(6,23,53,0.92);backdrop-filter:blur(14px) saturate(130%);box-shadow:0 1px 0 0 rgba(255,255,255,0.14)}`}</style>
        </noscript>

        <a href="#the-work" className={styles.skipLink}>
          Skip to the role
        </a>

        <SiteHeader />

        {/*
          This page renders its own document structure instead of PageWrapper's,
          so the main landmark has to be declared here. It is a plain block
          wrapper around the content sections only — the header, the footer and
          the apply bar stay outside it, and no layout property is set on it.
        */}
        <main id="main-content">
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
                3C World Group is looking for door-to-door sales reps to sell fiber internet,
                TV and home security in their own neighborhoods. You knock, you listen, you
                close — and you get trained to do all three. 1099 independent contractor,
                commission-only, uncapped.
              </p>

              <div className={styles.heroActions}>
                <Link href={APPLY_HREF} className={`${styles.btn} ${styles.btnLime} ${styles.btnLg}`}>
                  Apply to sell with 3C
                  <ArrowRight aria-hidden="true" className={styles.btnArrow} size={19} strokeWidth={2.2} />
                </Link>
                <a href="#the-work" className={`${styles.btn} ${styles.btnGhost} ${styles.btnLg}`}>
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
          {/*
            tabIndex={-1} so the skip link moves real focus here, not just the
            scroll position — otherwise the next Tab would continue from the
            skip link at the top of the document.
          */}
          <section id="the-work" className={styles.work} aria-labelledby="work-title" tabIndex={-1}>
            <div className={styles.shell}>
              <header className={styles.workHead} data-reveal>
                <h2 id="work-title" className={styles.sectionTitle}>
                  Three things happen
                  <br />
                  at every door.
                </h2>
                <p className={styles.sectionLede}>
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
            <div className={styles.shell}>
              <header className={styles.routeHead} data-reveal>
                <h2 id="start-title" className={styles.sectionTitleInk}>
                  From application
                  <br />
                  to your first route.
                </h2>
                <p className={styles.sectionLedeInk}>
                  Four steps, in order. No part of this is a formality — the conversation is a
                  real one, and the training happens before anyone sends you out.
                </p>
              </header>

              <RouteSequence />

              <p className={styles.routeFoot}>
                Timing depends on the market and on you.{" "}
                <Link href="/opportunities" className={styles.inlineLink}>
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
            <div className={styles.shell}>
              <header className={styles.marketsHead} data-reveal>
                <h2 id="markets-title" className={styles.sectionTitle}>
                  Pick the ground
                  <br />
                  you want to walk.
                </h2>
                <p className={styles.sectionLede}>
                  These are markets where 3C teams work. Choose one to read about it — then
                  apply and tell us where you want to be. Opportunities vary by market and
                  change with client demand, so we would rather talk than promise.
                </p>
              </header>

              <LocationExplorer />
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* 5 — questions                                                    */}
          {/* ---------------------------------------------------------------- */}
          <section id="questions" className={styles.faq} aria-labelledby="faq-title">
            <div className={styles.shellNarrow}>
              <h2 id="faq-title" className={styles.sectionTitleInk} data-reveal>
                Straight answers.
              </h2>

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
          <section className={styles.doors} aria-labelledby="doors-title">
            <div className={styles.shell}>
              <h2 id="doors-title" className={styles.srOnly}>
                Apply as a rep, or bring a team
              </h2>

              <div className={styles.doorPrimary} data-reveal>
                <p className={styles.doorKind}>Selling for yourself</p>
                <p className={styles.doorPitch}>
                  If you want to work a route, get trained on the products, and be paid on what
                  you close — this is the one. Apply and we will take it from there.
                </p>
                <Link href={APPLY_HREF} className={`${styles.btn} ${styles.btnLime} ${styles.btnLg}`}>
                  Apply
                  <ArrowRight aria-hidden="true" className={styles.btnArrow} size={19} strokeWidth={2.2} />
                </Link>
              </div>

              <div className={styles.doorSecondary}>
                <p className={styles.doorKindQuiet}>Already running a crew?</p>
                <p className={styles.doorPitchQuiet}>
                  If you lead a sales team and want to bring it to 3C, that is a different
                  conversation and it starts with a message, not an application.
                </p>
                <Link href="/contact" className={styles.quietLink}>
                  Contact the team
                  <ArrowUpRight aria-hidden="true" className={styles.btnArrow} size={16} strokeWidth={2.2} />
                </Link>
              </div>
            </div>
          </section>

          {/* ---------------------------------------------------------------- */}
          {/* 7 — closing                                                      */}
          {/* ---------------------------------------------------------------- */}
          <section className={styles.closing} aria-labelledby="closing-title">
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
                Tell us where you want to work. We will tell you what the day looks like there.
              </p>
              <Link href={APPLY_HREF} className={`${styles.btn} ${styles.btnLime} ${styles.btnLg}`}>
                Apply to sell with 3C
                <ArrowRight aria-hidden="true" className={styles.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
            </div>
          </section>
        </main>

        {/* ---------------------------------------------------------------- */}
        {/* 8 — slim footer                                                  */}
        {/* ---------------------------------------------------------------- */}
        <footer className={styles.footer}>
          <div className={styles.footerRow}>
            <Link href="/" className={styles.footerBrand} aria-label="3C World Group home">
              <Image src="/logo.png" alt="" width={550} height={516} className={styles.footerMark} sizes="34px" />
              <span>3C World Group</span>
            </Link>

            <nav className={styles.footerNav} aria-label="Footer">
              {NAV_LINKS.map((link) => (
                <Link key={link.href} href={link.href}>
                  {link.label}
                </Link>
              ))}
              <Link href={APPLY_HREF}>Apply</Link>
              <Link href="/portal">Employee login</Link>
            </nav>

            <div className={styles.footerSocial}>
              <a href="https://www.linkedin.com/company/3cworldgroup" aria-label="3C World Group on LinkedIn">
                <FaLinkedinIn aria-hidden="true" />
              </a>
              <a href="https://www.facebook.com/3cworldgroup" aria-label="3C World Group on Facebook">
                <FaFacebookF aria-hidden="true" />
              </a>
              <a href="https://www.instagram.com/3cworldgroup" aria-label="3C World Group on Instagram">
                <FaInstagram aria-hidden="true" />
              </a>
            </div>
          </div>

          <div className={styles.footerLegal}>
            <p>© {new Date().getFullYear()} 3C World Group. Sales roles are 1099 independent contractor positions.</p>
            <p>
              <Link href="/privacy">Privacy</Link>
              <Link href="/terms">Terms</Link>
            </p>
          </div>
        </footer>

        {/* Compact apply affordance — appears once the hero is behind you.   */}
        <div className={styles.applyBar} data-apply-bar>
          <span>Door-to-door sales · 1099, commission-only</span>
          <Link href={APPLY_HREF} className={`${styles.btn} ${styles.btnLime} ${styles.btnSm}`}>
            Apply
            <ArrowRight aria-hidden="true" className={styles.btnArrow} size={15} strokeWidth={2.2} />
          </Link>
        </div>
      </div>
    </MotionRoot>
  );
}
