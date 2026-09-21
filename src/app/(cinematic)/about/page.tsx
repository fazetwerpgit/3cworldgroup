import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./about.module.css";

export const metadata: Metadata = {
  title: "About Us | 3C World Group",
  description:
    "3C World Group connects sales professionals, customers, and trusted service providers across the country.",
};

/**
 * About, in the cinematic language. Every claim on this page is carried over
 * from the page it replaces — the story sentence, the four figures, the mission
 * paragraphs, the three C's, the leadership list and the two audiences. Nothing
 * is added: no new numbers, no founding date, no bios, no photographs of people.
 *
 * The composition is the thing that changed. One idea per section, alternating
 * navy and paper with the kit's authored seam at every joint, and photography
 * only from the existing v2 set.
 */

const VALUES = [
  [
    "01",
    "Connection",
    "The service that fits the household, explained at the door by someone who knows it.",
  ],
  [
    "02",
    "Community",
    "Contractors trained by people who have worked the route, and supported in the field.",
  ],
  [
    "03",
    "Commitment",
    "A real conversation at every door, and follow-through on what was promised there.",
  ],
] as const;

const CONTRACTOR_SUPPORT = ["Training before the first door", "A route in a live market", "A leader who picks up the phone"] as const;

/** The four people who lead the company, and what each is responsible for. */
const LEADERS = [
  ["Jeremy McFarland", "Founder & CEO"],
  ["William Teasdale", "Director of Sales"],
  ["Jacob Myers", "Operations"],
  ["Braeden Crouse", "Onboarding"],
] as const;

export default function AboutPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Page head — the neighbourhood the whole company is about, under the */}
      {/* kit's authored scrim, with one left column standing on it.          */}
      {/* ---------------------------------------------------------------- */}
      <header className={`${kit.pageHead} ${styles.head}`}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/cinematic/about-aerial-dusk-1920.webp"
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
            <p className={kit.pageHeadEyebrow}>Our story</p>
            <h1 className={kit.pageHeadTitle}>
              We connect America.
              <span className={kit.pageHeadLime}>One door at a time.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              3C World Group is a face-to-face sales company. We sell fiber, TV and home
              security at the door for the providers who serve each market.
            </p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Apply now
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
              <a href="#who-we-serve" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                Who we serve
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 1 — the opening frame                                            */}
      {/* ---------------------------------------------------------------- */}
      <section id="story" className={`${kit.surfaceInk} ${styles.story}`} aria-labelledby="story-title">
        <h2 id="story-title" className={kit.srOnly}>
          3C World Group at a glance
        </h2>

        {/*
          Full bleed on purpose: the band is the page's photographic opening, and
          the scrim dissolves both of its edges into the navy above and below so
          it reads as a frame in the film rather than a pasted rectangle.
        */}
        <div id="story-band" className={styles.band}>
          <Image
            src="/redesign/cinematic/fiber-pedestal-dusk-1920.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.bandImage}
          />
          <div className={styles.bandScrim} aria-hidden="true" />
        </div>

      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — the mission                                                  */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="mission"
        className={`${kit.surfacePaper} ${kit.seam} ${styles.mission}`}
        aria-labelledby="mission-title"
      >
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="mission-title" className={kit.sectionTitleInk}>
              We sell at
              <br />
              the door.
            </h2>
            <p className={kit.sectionLedeInk}>
              Fiber, TV and home security for the providers we represent, sold face to face
              in the neighborhoods they serve.
            </p>
          </header>

          <div className={styles.missionBody}>
            <div className={`${styles.missionCopy} ${kit.revealRise}`} data-reveal>
              <p className={styles.missionLead}>
                3C World Group recruits, trains and supports independent contractors, and
                puts them on routes in markets where the service is available. The provider
                gets customers who understood what they bought. The contractor gets a trade
                they can build on.
              </p>
            </div>

            {/*
              The fibre burst from the existing v2 set: many strands out of a
              single point, which is the mission stated as a picture. A dark frame
              on the paper ground, not a tinted panel.
            */}
            <figure className={`${styles.missionFigure} ${kit.revealRise}`} data-reveal>
              <Image
                src="/redesign/cinematic/doorhanger-dusk-1920.webp"
                alt=""
                fill
                sizes="(max-width: 900px) 100vw, 42vw"
                className={styles.missionImage}
              />
            </figure>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — the three C's                                                */}
      {/* ---------------------------------------------------------------- */}
      <section id="values" className={`${kit.surfaceInk} ${styles.values}`} aria-labelledby="values-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="values-title" className={kit.sectionTitle}>
              The three C&rsquo;s
              <br />
              that define us.
            </h2>
            <p className={kit.sectionLede}>
              Connection, community and commitment — the three the company is named for, and
              the three it is run on.
            </p>
          </header>

          <ol className={styles.valueList}>
            {VALUES.map(([, name, body]) => (
              <li key={name} className={`${styles.value} ${kit.revealRise}`} data-reveal>
                <h3 className={styles.valueName}>{name}</h3>
                <p className={styles.valueBody}>{body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — the two people on either side of the door                    */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="who-we-serve"
        className={`${kit.surfacePaper} ${kit.seam} ${styles.serve}`}
        aria-labelledby="serve-title"
      >
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="serve-title" className={kit.sectionTitleInk}>
              Who we
              <br />
              serve.
            </h2>
            <p className={kit.sectionLedeInk}>
              There are two people in every one of these conversations: the household that
              needs the service, and the contractor who brings it to the door.
            </p>
          </header>

          <div className={styles.serveGrid}>
            <article className={`${styles.serveItem} ${kit.revealRise}`} data-reveal>
              <p className={styles.serveKind}>For our customers</p>
              <h3 className={styles.serveTitle}>
                The right service,
                <br />
                explained at the door.
              </h3>
              <p className={styles.serveBody}>
                Fiber, TV and home security from the providers in their market, with someone
                on the porch who can say what it costs and when it gets installed.
              </p>
              <p className={styles.productLine}>Fiber internet. TV. Home security.</p>
            </article>

            <article className={`${styles.serveItem} ${kit.revealRise}`} data-reveal>
              <p className={styles.serveKind}>For our contractors</p>
              <h3 className={styles.serveTitle}>
                A route, training,
                <br />
                and someone to call.
              </h3>
              <p className={styles.serveBody}>
                Training before the first door, a route in a live market, and a leader who
                has worked one and picks up the phone.
              </p>
              <ul className={styles.supportList}>
                {CONTRACTOR_SUPPORT.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <Link href={APPLY_HREF} className={`${kit.quietLinkInk} ${styles.applyLink}`}>
                Apply to sell with 3C
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
              </Link>
            </article>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 5 — leadership                                                   */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="leadership"
        className={`${kit.surfaceInk} ${styles.leadership}`}
        aria-labelledby="leadership-title"
      >
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="leadership-title" className={kit.sectionTitle}>
              The people
              <br />
              who run it.
            </h2>
            <p className={kit.sectionLede}>
              The people who lead 3C World Group, and what each of them is responsible for.
            </p>
          </header>

          <ul className={styles.leaderList}>
            {LEADERS.map(([name, role]) => (
              <li key={name} className={`${styles.leader} ${kit.revealRise}`} data-reveal>
                <span className={styles.leaderName}>{name}</span>
                <span className={styles.leaderRole}>{role}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 6 — closing                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section id="closing" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/cinematic/about-street-dusk-1920.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div id="closing-inner" className={styles.closingInner}>
          <h2 id="closing-title" className={styles.closingTitle}>
            Join the <span className={styles.lime}>3C team.</span>
          </h2>
          <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Apply now
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </Link>
        </div>
      </section>
    </>
  );
}
