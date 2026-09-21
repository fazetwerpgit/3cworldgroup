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

/** Carried verbatim from the page this replaces. See the report: unverified. */
const FIGURES = [
  ["50+", "States served"],
  ["1,000+", "Contractors"],
  ["$5K+", "Weekly potential"],
  ["98%", "Satisfaction"],
] as const;

const VALUES = [
  [
    "01",
    "Connection",
    "We connect customers with the services they need and build relationships that last.",
  ],
  [
    "02",
    "Community",
    "We foster a culture of respect, growth, and opportunity for our contractors and partners.",
  ],
  [
    "03",
    "Commitment",
    "We are committed to integrity, excellence, and delivering outstanding results every day.",
  ],
] as const;

/** The three products, with the existing photography for each. */
const PRODUCTS = [
  ["Fiber", "/redesign/v2/photos/fiber-square-800.webp"],
  ["TV", "/redesign/v2/photos/tv-square-800.webp"],
  ["Security", "/redesign/v2/photos/security-square-800.webp"],
] as const;

const CONTRACTOR_SUPPORT = ["Hands-on Training", "Protected Territories", "Ongoing Support"] as const;

const LEADERS = [
  ["JM", "Jeremy McFarland", "Founder & CEO"],
  ["WT", "William Teasdale", "Director of Sales"],
  ["JM", "Jacob Myers", "Operations"],
  ["BC", "Braeden Crouse", "Onboarding"],
] as const;

export default function AboutPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* Page head — the neighbourhood the whole company is about, under the */}
      {/* kit's authored scrim, with one left column standing on it.          */}
      {/* ---------------------------------------------------------------- */}
      <header className={kit.pageHead}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/v2/photos/hero-wide-1600.webp"
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
              3C World Group is a nationwide face-to-face sales organization specializing in
              customer acquisition for telecommunications and security providers.
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
      {/* 1 — the door, and the four figures under it                      */}
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
            src="/redesign/v2/photos/security-dusk-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.bandImage}
          />
          <div className={styles.bandScrim} aria-hidden="true" />
        </div>

        <div className={kit.shell}>
          <dl className={`${styles.figures} ${kit.revealRise}`} data-reveal>
            {FIGURES.map(([value, label]) => (
              <div key={label} className={styles.figure}>
                <dt>{value}</dt>
                <dd>{label}</dd>
              </div>
            ))}
          </dl>
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
              Empowering sales
              <br />
              professionals.
            </h2>
            <p className={kit.sectionLedeInk}>
              We empower sales professionals through training, support, and opportunity —
              helping them build rewarding careers while delivering exceptional service to
              customers.
            </p>
          </header>

          <div className={styles.missionBody}>
            <div className={`${styles.missionCopy} ${kit.revealRise}`} data-reveal>
              <p className={styles.missionLead}>
                For more than 10+ years, 3C World Group has been opening doors for top-tier
                brands and creating opportunities for motivated professionals across the
                country.
              </p>
              <p className={styles.missionNote}>Building lasting connections.</p>
            </div>

            {/*
              The fibre burst from the existing v2 set: many strands out of a
              single point, which is the mission stated as a picture. A dark frame
              on the paper ground, not a tinted panel.
            */}
            <figure className={`${styles.missionFigure} ${kit.revealRise}`} data-reveal>
              <Image
                src="/redesign/v2/photos/fiber-wide-1600.webp"
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
            {VALUES.map(([ordinal, name, body]) => (
              <li key={name} className={`${styles.value} ${kit.revealRise}`} data-reveal>
                <p className={styles.valueOrdinal}>{ordinal}</p>
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
                Better services.
                <br />
                Built for your home.
              </h3>
              <p className={styles.serveBody}>
                We connect customers to the essential services they rely on — fiber, TV, and
                security — delivered by trusted providers with the quality and reliability
                they deserve.
              </p>
              <ul className={styles.productStrip}>
                {PRODUCTS.map(([label, src]) => (
                  <li key={label} className={styles.product}>
                    <span className={styles.productArt}>
                      <Image src={src} alt="" fill sizes="(max-width: 900px) 30vw, 14vw" />
                    </span>
                    <span className={styles.productLabel}>{label}</span>
                  </li>
                ))}
              </ul>
            </article>

            <article className={`${styles.serveItem} ${kit.revealRise}`} data-reveal>
              <p className={styles.serveKind}>For our contractors</p>
              <h3 className={styles.serveTitle}>
                Built for your success.
                <br />
                Backed every step.
              </h3>
              <p className={styles.serveBody}>
                We invest in our contractors with hands-on training, protected territories,
                and ongoing support so you can build a career with confidence and grow
                without limits.
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
              Built on experience.
              <br />
              Driven by purpose.
            </h2>
            <p className={kit.sectionLede}>
              The people who lead 3C World Group, and what each of them is responsible for.
            </p>
          </header>

          <ul className={styles.leaderList}>
            {LEADERS.map(([initials, name, role]) => (
              <li key={name} className={`${styles.leader} ${kit.revealRise}`} data-reveal>
                <span className={styles.leaderInitials} aria-hidden="true">
                  {initials}
                </span>
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
          src="/redesign/v2/photos/fiber-dusk-1600.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div id="closing-inner" className={styles.closingInner}>
          <p id="closing-eyebrow" className={styles.closingEyebrow}>
            Ready to build your future?
          </p>
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
