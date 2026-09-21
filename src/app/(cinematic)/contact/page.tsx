import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import ContactForm from "./ContactForm";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./contact.module.css";

export const metadata: Metadata = {
  title: "Contact | 3C World Group",
  description:
    "Get in touch with 3C World Group — join as a sales rep, bring or build a team, or ask about the services we represent.",
};

/**
 * Contact, in the cinematic language. An interior page: it opens on
 * `kit.pageHead`, so SiteHeader is condensed from the first paint. The chrome,
 * the motion root and `.page` live in src/app/(cinematic)/layout.tsx — this
 * file is sections.
 *
 * Everything stated here was already on the page this replaces
 * (src/app/contact/page.tsx): the same three fast paths and their destinations,
 * the same five form fields and five subjects, the same two addresses, the same
 * phone placeholder and business hours, the same closing. One line was dropped
 * rather than carried — the old success panel promised a reply "within 24-48
 * hours", and PAGE-KIT's standing prohibitions rule out a guaranteed callback
 * window. Nothing was added.
 *
 * The opening image is the owner's italic lime-outline 3C street-map mark, kept
 * and rebuilt rather than replaced, with its diagonal continued into the
 * section below it. contact.module.css carries the measured geometry.
 */

/** The three routes off this page, with the destinations the old page used. */
const PATHS = [
  { kind: "Joining 3C", title: "Join as a sales rep", href: APPLY_HREF },
  { kind: "Leading a crew", title: "Bring or build a team", href: "/opportunities" },
  { kind: "Anything else", title: "Services & support", href: "/services" },
];

export default function ContactPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the page head, opened by the 3C mark                          */}
      {/* ---------------------------------------------------------------- */}
      <header className={`${kit.pageHead} ${styles.head}`}>
        <div className={`${kit.pageHeadInner} ${styles.headInner}`}>
          <div className={kit.pageHeadCol}>
            <p className={kit.pageHeadEyebrow}>Get in touch</p>
            {/*
              One white line and one lime line, like every other head on the
              site. The words are the page's own and are not rewritten — only
              the break moved: the lime used to start a line early and run to a
              second one, so this was the one head on the site wearing two lime
              lines instead of one.
            */}
            <h1 className={`${kit.pageHeadTitle} ${styles.headTitle}`}>
              Let’s start the right
              <span className={kit.pageHeadLime}>conversation.</span>
            </h1>
            <p className={`${kit.pageHeadLede} ${styles.headLede}`}>
              Questions about joining 3C, building a contractor team, or the services we
              represent? Choose a path and we’ll point you in the right direction.
            </p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start your application
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
              <a href="#message" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                Send us a message
              </a>
            </div>
          </div>
        </div>

        {/*
          The mark the owner named, and the line that leaves it. Above 1024 the
          mark is bled off the right edge and anchored to the bottom of the
          head; below it, it sits in the flow under the copy. The trail is a
          child of the mark either way, so the point it starts from is a
          fraction of the mark's own width rather than a second measurement —
          see the note in contact.module.css.
        */}
        <div className={styles.headArt} aria-hidden="true">
          <Image
            src="/redesign/contact-three-c-hd-x4f.webp"
            alt=""
            width={1395}
            height={1140}
            priority
            sizes="(max-width: 1023px) 34rem, 44vw"
            className={styles.headArtImage}
          />

          <span className={styles.headTrail} data-reveal>
            <svg
              className={styles.headLine}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              focusable="false"
            >
              {/*
                `preserveAspectRatio="none"` over a box whose aspect ratio is
                the line's own dx/dy keeps the angle exact without a degree
                value written down twice, and `non-scaling-stroke` keeps the
                stroke even under that uneven scale. 3px is the width the mark's
                own line renders at once the file is scaled down, which is what
                makes the handoff invisible.
              */}
              <line
                className={styles.headLinePath}
                x1="100"
                y1="0"
                x2="0"
                y2="100"
                pathLength={1}
                stroke="var(--lime)"
                strokeWidth={3}
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            <span className={styles.headNode} />
          </span>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — the fastest path                                             */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="fastest-path"
        className={`${kit.surfaceInk} ${styles.path}`}
        aria-labelledby="fastest-path-title"
      >
        <div className={kit.shell}>
          <header className={`${kit.sectionHead} ${styles.pathHead}`} data-reveal>
            <h2 id="fastest-path-title" className={kit.sectionTitle}>
              The fastest
              <br />
              path.
            </h2>
            <p className={kit.sectionLede}>
              Three routes off this page. If one of them is why you came, take it — it goes
              straight to the page that answers you, without the form.
            </p>
          </header>

          <div className={styles.pathList}>
            {PATHS.map((path) => (
              <Link
                key={path.href}
                href={path.href}
                className={`${styles.pathRow} ${kit.revealRise}`}
                data-reveal
              >
                <span className={styles.pathKind}>{path.kind}</span>
                <span className={styles.pathTitle}>{path.title}</span>
                <ArrowRight
                  aria-hidden="true"
                  className={styles.pathArrow}
                  size={26}
                  strokeWidth={2}
                />
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — the message, and the addresses behind it                     */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="message"
        className={`${kit.surfacePaper} ${kit.seam} ${styles.formSection}`}
        aria-labelledby="message-title"
      >
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="message-title" className={kit.sectionTitleInk}>
              Send us
              <br />
              a message.
            </h2>
            <p className={kit.sectionLedeInk}>
              If none of those three is it, write to us here. Tell us who you are, pick the
              subject that fits, and say what you need.
            </p>
          </header>

          <div className={styles.formLayout}>
            <ContactForm />

            <div className={styles.details}>
              <div className={styles.detail}>
                <p className={styles.detailTerm}>Email</p>
                <div className={styles.detailValue}>
                  <a className={styles.detailLink} href="mailto:info@3cworldgroup.com">
                    info@3cworldgroup.com
                  </a>
                  <a className={styles.detailLink} href="mailto:careers@3cworldgroup.com">
                    careers@3cworldgroup.com
                  </a>
                </div>
              </div>

              <div className={styles.detail}>
                <p className={styles.detailTerm}>Phone</p>
                <div className={styles.detailValue}>
                  <span>Coming soon</span>
                </div>
              </div>

              <div className={styles.detail}>
                <p className={styles.detailTerm}>Business hours</p>
                <div className={styles.detailValue}>
                  <span>Monday – Friday: 9am – 6pm EST</span>
                  <span>Saturday: 10am – 4pm EST</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — closing                                                      */}
      {/* ---------------------------------------------------------------- */}
      <section
        id="closing"
        className={`${kit.surfaceInkDeep} ${styles.closing}`}
        aria-labelledby="closing-title"
      >
        <div className={kit.shell}>
          <div className={`${styles.closingInner} ${kit.revealRise}`} data-reveal>
            <p className={styles.closingEyebrow}>Your next move</p>
            <h2 id="closing-title" className={styles.closingTitle}>
              Don’t need to wait?
              <br />
              <span className={styles.headTitleLime}>Apply today.</span>
            </h2>
            <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
              Start your application
              <ArrowUpRight
                aria-hidden="true"
                className={kit.btnArrow}
                size={19}
                strokeWidth={2.2}
              />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
