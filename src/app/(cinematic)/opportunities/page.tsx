import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./careers.module.css";

export const metadata: Metadata = {
  title: "Career Path | 3C World Group",
  description:
    "Build a career with 3C World Group through training, support, and a clear path forward.",
};

/**
 * Careers, in the cinematic language. An interior page: it opens on
 * `kit.pageHead`, not on a photograph, so SiteHeader is condensed from the
 * first paint. The chrome, the motion root and `.page` all live in
 * src/app/(cinematic)/layout.tsx — this file is sections.
 *
 * Every claim here was already published on the page this replaces
 * (src/app/opportunities/page.tsx): the nationwide framing, the four
 * at-a-glance benefits, the four-step path, the three weekly earning bands and
 * their caveat. Nothing was added. What changed is the composition: the old
 * page was four icon-card grids stacked, and this is five chapters that
 * alternate navy and paper across an authored seam, each carrying one idea.
 */

/** The opportunity at a glance — verbatim from the page this replaces. */
const GLANCE = [
  {
    title: "Uncapped commission",
    body: "Your effort drives your earnings. Top performers earn more.",
  },
  {
    title: "Full training",
    body: "We equip you with proven systems and ongoing support.",
  },
  {
    title: "Flexible schedule",
    body: "Set your own hours and build a schedule that works for you.",
  },
  {
    title: "Protected territory",
    body: "Exclusive markets so you can build long-term success.",
  },
];

/** The four steps, in order, unchanged. */
const PATH = [
  {
    title: "Apply online",
    body: "Submit your application in minutes. We're always looking for driven individuals.",
  },
  {
    title: "Interview",
    body: "Let's get to know you and explore how your goals align with our opportunity.",
  },
  {
    title: "Training",
    body: "Learn our proven sales process, products, and tools with hands-on coaching and support.",
  },
  {
    title: "Start earning",
    body: "Launch in your protected territory and start building your income from day one.",
  },
];

/** The three weekly bands, ranges and bodies unchanged. */
const BANDS = [
  {
    title: "Getting started",
    range: "$1K–$2K",
    body: "Build your pipeline and close your first deals.",
  },
  {
    title: "Building momentum",
    range: "$2K–$4K",
    body: "Refine your process, increase consistency, and grow.",
  },
  {
    title: "Top performers",
    range: "$5K+",
    body: "Advanced skills. Bigger results. Unlimited potential.",
  },
];

export default function OpportunitiesPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Page head — navy, deep enough to clear the fixed header          */}
      {/* ---------------------------------------------------------------- */}
      <header className={kit.pageHead}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/v2/photos/security-dusk-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={kit.pageHeadImage}
          />
        </div>
        <div className={kit.pageHeadScrim} aria-hidden="true" />

        <div className={kit.pageHeadInner}>
          <div className={kit.pageHeadCol}>
            <p className={kit.pageHeadEyebrow}>Now hiring nationwide</p>
            <h1 className={kit.pageHeadTitle}>
              Build a career.
              <span className={kit.pageHeadLime}>Not just a job.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              Choose your path. Build your market. Grow with real training and support.
            </p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start your application
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
              <a href="#earnings" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                Earning potential
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 1 — what the role gives you                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="glance" className={styles.glance} aria-labelledby="glance-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="glance-title" className={kit.sectionTitle}>
              The opportunity,
              <br />
              at a glance.
            </h2>
            <p className={kit.sectionLede}>
              What you get from day one. No fine print and no waiting period.
            </p>
          </header>

          <div className={styles.glanceLayout}>
            <ol className={styles.glanceList}>
              {GLANCE.map((item, index) => (
                <li
                  key={item.title}
                  className={`${styles.glanceItem} ${kit.revealRise}`}
                  data-reveal
                >
                  <span className={styles.glanceNum}>
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div>
                    <h3 className={styles.glanceItemTitle}>{item.title}</h3>
                    <p className={styles.glanceItemBody}>{item.body}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/*
              The curb at dusk: an open pedestal, a tool bag in the grass and a
              lit street behind it — the route this job actually is, with no one
              in the frame. The lit front door is the page head, so the mid-page
              frame is a different moment on the same walk.
              The scrim is the homepage's two-layer authored one: a horizontal
              wash that dissolves the frame's left edge into the copy column
              beside it, and a vertical fall so it sits down into the navy
              rather than ending on a cut.
            */}
            <div className={styles.glanceArt} aria-hidden="true">
              <Image
                src="/redesign/v2/photos/fiber-dusk-1600.webp"
                alt=""
                fill
                priority
                sizes="(max-width: 900px) 100vw, 44vw"
                className={styles.glanceArtImage}
              />
              <div className={styles.glanceArtScrim} />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — the path, on paper, across the seam                          */}
      {/* ---------------------------------------------------------------- */}
      <section id="how-it-works" className={styles.path} aria-labelledby="path-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="path-title" className={kit.sectionTitleInk}>
              Your path
              <br />
              to success.
            </h2>
            <p className={kit.sectionLedeInk}>
              Four steps, in order — from the application you send tonight to the day you
              start earning.
            </p>
          </header>

          {/*
            A rail, not four cards: one hairline carries all four stations, with
            a lime node where each one sits and the last node ringed so the
            sequence arrives rather than stopping. Below 1080px the rail turns
            and runs down the left instead, because four columns of body copy do
            not survive a tablet.
          */}
          <ol className={styles.rail}>
            {PATH.map((step, index) => (
              <li
                key={step.title}
                className={`${styles.railStep} ${kit.revealRise}`}
                data-reveal
                data-last={index === PATH.length - 1 ? "true" : undefined}
              >
                <span className={styles.railNode} aria-hidden="true" />
                <span className={styles.railNum}>Step {index + 1}</span>
                <h3 className={styles.railTitle}>{step.title}</h3>
                <p className={styles.railBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — earning potential                                            */}
      {/* ---------------------------------------------------------------- */}
      <section id="earnings" className={styles.earnings} aria-labelledby="earnings-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="earnings-title" className={kit.sectionTitle}>
              Earning
              <br />
              potential.
            </h2>
            <p className={kit.sectionLede}>
              Three stages of the same job, stated by the week.
            </p>
          </header>

          <ol className={styles.bands}>
            {BANDS.map((band) => (
              <li key={band.title} className={`${styles.band} ${kit.revealRise}`} data-reveal>
                <div className={styles.bandCopy}>
                  <h3 className={styles.bandTitle}>{band.title}</h3>
                  <p className={styles.bandBody}>{band.body}</p>
                </div>
                <p className={styles.bandRange}>
                  {band.range}
                  <span>per week</span>
                </p>
              </li>
            ))}
          </ol>

          <p className={styles.bandNote}>Earnings vary by performance and market.</p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — closing                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="apply" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/v2/photos/hero-wide-1600.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={styles.closingInner}>
          <p className={styles.closingEyebrow}>Ready when you are</p>
          <h2 id="closing-title" className={styles.closingTitle}>
            Your next market
            <br />
            <span className={styles.lime}>starts here.</span>
          </h2>
          <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Start your application
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </Link>
        </div>
      </section>
    </>
  );
}
