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
  ["Connection", "The right service, explained at the door by someone who knows it."],
  ["Community", "Contractors trained and backed by people who have worked the route."],
  ["Commitment", "Follow-through on what was promised on the porch."],
] as const;

/** The two people in every conversation, one line each. */
const AUDIENCES = [
  [
    "For customers",
    "Someone on the porch who can say what the provider in their market offers, what it costs and when it gets installed.",
  ],
  [
    "For contractors",
    "Training before the first door, a route in a live market, and a leader who has worked one and picks up the phone.",
  ],
] as const;

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
              <a href="#mission" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                What we do
              </a>
            </div>
          </div>
        </div>
      </header>

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
              Face to face, for the providers we represent, in the neighborhoods they
              serve. Two people in every conversation, and we work for both.
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

              {/*
                The old "Who we serve" section, reduced to the two lines it
                was actually saying. They belong under the mission, not in a
                section of their own with two headings and a bullet list.
              */}
              <dl className={styles.audiences}>
                {AUDIENCES.map(([kind, body]) => (
                  <div key={kind} className={styles.audience}>
                    <dt className={styles.audienceKind}>{kind}</dt>
                    <dd className={styles.audienceBody}>{body}</dd>
                  </div>
                ))}
              </dl>
              <Link href={APPLY_HREF} className={`${kit.quietLinkInk} ${styles.applyLink}`}>
                Apply to sell with 3C
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
              </Link>
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
      {/* 3 — the three C's, over the neighbourhood                        */}
      {/* ---------------------------------------------------------------- */}
      {/*
        The values used to be three text columns on navy — the one section on
        the page with no picture, past the point where the owner stopped
        reading. Now they sit on the neighbourhood itself: a street corner at
        dusk with a bench, a lamp and the mailboxes, the left third dark where
        the copy stands. Three names, one line each.
      */}
      <section id="values" className={styles.values} aria-labelledby="values-title">
        <Image
          src="/redesign/cinematic/about-corner-dusk-1920.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.valuesArt}
        />
        <div className={styles.valuesScrim} aria-hidden="true" />
        <div className={`${kit.shell} ${styles.valuesInner}`}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="values-title" className={kit.sectionTitle}>
              The three C&rsquo;s
              <br />
              that define us.
            </h2>
          </header>

          <dl className={styles.valueList}>
            {VALUES.map(([name, body]) => (
              <div key={name} className={`${styles.value} ${kit.revealRise}`} data-reveal>
                <dt className={styles.valueName}>{name}</dt>
                <dd className={styles.valueBody}>{body}</dd>
              </div>
            ))}
          </dl>
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
