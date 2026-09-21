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
 * Every claim here is grounded in the opportunity page and current training
 * language. What changed is the composition: the old
 * page was four icon-card grids stacked, and this is four chapters that
 * alternate navy and paper across an authored seam, each carrying one idea.
 * The four-step path is not repeated here: the homepage owns the route.
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
    title: "Field support",
    body: "Work with experienced leaders as you learn the role.",
  },
];

/*
  The three stages that replaced the weekly dollar bands. The ranges are gone
  because nothing published supports them; what is left is the shape of the
  progression, which the training does support. Each rung carries what the
  stage is and what changes when you reach it — both grounded in the
  training and support language the site already makes.
*/
const STAGES = [
  {
    title: "Learn the role",
    stage: "Stage one",
    body: "Train on the products, the process, and the conversation at the door.",
    changes: "Hands-on coaching and roleplay with experienced leaders, in the field.",
  },
  {
    title: "Build consistency",
    stage: "Stage two",
    body: "Work the process on a route, with field support to review how it went.",
    changes: "Your own route in an available market, with a leader checking in.",
  },
  {
    title: "Take on more",
    stage: "Stage three",
    body: "Take on more responsibility as your experience and your results develop.",
    changes: "A bigger part in the team, and in how the route is worked.",
  },
];

export default function OpportunitiesPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Page head — navy, deep enough to clear the fixed header          */}
      {/* ---------------------------------------------------------------- */}
      <header className={`${kit.pageHead} ${styles.head}`}>
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
            <p className={kit.pageHeadEyebrow}>Hiring in selected markets</p>
            <h1 className={kit.pageHeadTitle}>
              Build a career.
              <span className={kit.pageHeadLime}>Not just a job.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              Choose your role. Build your skills. Grow with real training and support.
            </p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start your application
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
              <a href="#stages" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                How the role grows
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
              How the role works.
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
      {/* 2 — the three stages                                             */}
      {/* ---------------------------------------------------------------- */}
      <section id="stages" className={styles.earnings} aria-labelledby="stages-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="stages-title" className={kit.sectionTitle}>
              Three stages
              <br />
              of the same job.
            </h2>
            <p className={kit.sectionLede}>
              In the order you grow into them. What changes at each one is the
              responsibility, not the title.
            </p>
          </header>

          {/*
            A ledger, not three columns: each stage is a full-width rung under
            one rule, the ordinal at the left margin, the stage in the middle
            and what changes at the right. The eye reads down, the way the
            progression happens, and the three rungs are visibly different
            lengths because the copy is, which is what keeps it from reading as
            a template row.
          */}
          <ol className={styles.ledger}>
            {STAGES.map((stage, index) => (
              <li key={stage.title} className={`${styles.rung} ${kit.revealRise}`} data-reveal>
                <p className={styles.rungMark}>
                  <span className={styles.rungOrdinal} aria-hidden="true">{`0${index + 1}`}</span>
                  <span className={styles.rungStage}>{stage.stage}</span>
                </p>
                <div className={styles.rungMain}>
                  <h3 className={styles.rungTitle}>{stage.title}</h3>
                  <p className={styles.rungBody}>{stage.body}</p>
                </div>
                <p className={styles.rungChanges}>
                  <span className={styles.rungChangesLabel}>What changes</span>
                  {stage.changes}
                </p>
              </li>
            ))}
          </ol>

          {/*
            The pay disclosure, stated once and next to the progression it
            qualifies, so nothing above it can be read as an earnings claim.
          */}
          <p className={styles.bandNote}>
            This is 1099 independent contractor work, paid by commission only. Earnings
            vary by performance and market.
          </p>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — closing                                                      */}
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
