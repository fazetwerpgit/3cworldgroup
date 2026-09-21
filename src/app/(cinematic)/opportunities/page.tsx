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
 * page was four icon-card grids stacked, and this is three chapters that each
 * carry one idea. Round 15 (owner) moved the glance onto paper, so the page
 * now runs photographic hero, one paper chapter of two sections, then the navy
 * closer — the same ink/paper/ink read Home has, on straight edges.
 * The four-step path is not repeated here: the homepage owns the route.
 */

/**
 * The opportunity at a glance — verbatim from the page this replaces, with one
 * addition: the pay term now states the engagement on the term itself. The
 * disclosure under the stages still states it for the page as a whole, but a
 * reader who only scans this grid was previously told the ceiling was uncapped
 * without being told there is no floor.
 */
const GLANCE: { title: string; body: string; note?: string }[] = [
  {
    title: "Uncapped commission",
    body: "Your effort drives your earnings. Top performers earn more.",
    note: "1099 independent contractor, commission only.",
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
  /*
    Stage three is the only rung whose content is not drawn from the site's own
    training language: both facts come from the compensation schedule, which
    ties a higher per-account rate to a week's install count and ties travel to
    the highest weekly producers. No title, no promotion and no threshold
    number is stated here — the titles above account executive on that schedule
    sit on the ladder the site deliberately does not publish, and the numbers
    are the owner's to release.
  */
  {
    title: "Take on more",
    stage: "Stage three",
    body: "Raise your weekly install count on the route you already work, week after week.",
    changes:
      "Qualify for a higher commission tier when you meet the weekly installation threshold. Road trips and company events go to the highest weekly producers.",
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
            {/*
              The eyebrow names the constraint, so the link that answers it sits
              on the same line. The market list itself is the homepage's
              explorer — this page never had a markets section — so the link
              crosses to it rather than pointing at an anchor that does not
              exist here.
            */}
            <div className={styles.headEyebrow}>
              <p className={kit.pageHeadEyebrow}>Hiring in selected markets</p>
              <Link href="/#markets" className={`${kit.quietLink} ${styles.headMarketsLink}`}>
                See available markets
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
              </Link>
            </div>
            <h1 className={kit.pageHeadTitle}>
              Build a career.
              <span className={kit.pageHeadLime}>Not just a job.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              Door-to-door sales of fiber, TV and home security in a market that is hiring.
              Training first, then a route with a leader who checks in.
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
      {/* 1 — what the role gives you. Paper, and the first section of the  */}
      {/*     page's one paper run: the stages below share the ground, so   */}
      {/*     the two are separated by the rhythm and the stages head's own */}
      {/*     hairline, not by a second colour band.                        */}
      {/* ---------------------------------------------------------------- */}
      <section id="glance" className={styles.glance} aria-labelledby="glance-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="glance-title" className={kit.sectionTitleInk}>
              The opportunity,
              <br />
              at a glance.
            </h2>
            <p className={kit.sectionLedeInk}>
              What the work is, how you are paid, and where it happens. The details a
              recruiter would tell you on the phone, written down.
            </p>
          </header>

          {/*
            Round 16 (owner) removed the neighbourhood plate that stood beside
            these terms and set the four on one crossed hairline instead: two
            columns by two rows on desktop, a rule over each row and a single
            rule between the columns. No box and no icon — the grid is drawn by
            the hairlines the rest of the paper uses, and the set closes on the
            stages head's own rule rather than spending a third full-width one.
          */}
          <ol className={styles.glanceGrid}>
            {GLANCE.map((item) => (
              <li
                key={item.title}
                className={`${styles.glanceItem} ${kit.revealRise}`}
                data-reveal
              >
                <h3 className={styles.glanceItemTitle}>{item.title}</h3>
                <p className={styles.glanceItemBody}>{item.body}</p>
                {item.note ? <p className={styles.glanceItemNote}>{item.note}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — the three stages                                             */}
      {/* ---------------------------------------------------------------- */}
      <section id="stages" className={styles.earnings} aria-labelledby="stages-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="stages-title" className={kit.sectionTitleInk}>
              How you grow
              <br />
              with 3C.
            </h2>
            <p className={kit.sectionLedeInk}>
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
                  <span className={styles.rungOrdinal}>{`0${index + 1}`}</span>
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
          src="/redesign/cinematic/careers-culdesac-dusk-1920.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={styles.closingInner}>
          <h2 id="closing-title" className={styles.closingTitle}>
            There is a route open.
            <br />
            <span className={styles.lime}>Come work it.</span>
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
