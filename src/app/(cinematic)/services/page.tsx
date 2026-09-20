import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import { APPLY_HREF } from "../../_cinematic/nav";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./services.module.css";

export const metadata: Metadata = {
  title: "Our Services | 3C World Group",
  description:
    "Explore fiber internet, TV, and security solutions from 3C World Group.",
};

/**
 * Services, in the cinematic language. The page is sections and nothing else —
 * the chrome, the `.page` element and the motion root are all in
 * src/app/(cinematic)/layout.tsx.
 *
 * The composition is one camera move: a flat navy head, then a filmstrip of
 * three full-bleed dusk photographs that walk from the curb to the living room
 * to the front door, then the one light chapter where all three land on a
 * single account, then the map at the end. Every claim on the page is carried
 * over from the services page it replaces; nothing about speed, price, provider
 * or coverage has been added.
 */

const SERVICES = [
  {
    id: "fiber",
    number: "01",
    title: "Fiber Internet",
    accent: "The one everyone's waiting for.",
    body: "When fiber reaches a street, the whole block wants in. You're the person at the door with the answer.",
    image: "/redesign/v2/photos/fiber-dusk-1600.webp",
    alt: "Fiber optic cable cabinet and spool beside a suburban street at dusk",
    position: "58% 62%",
    points: [
      "Customers already want it",
      "One conversation, one install date",
      "A connection they'll keep for years",
    ],
  },
  {
    id: "tv",
    number: "02",
    title: "TV Services",
    accent: "The natural next question.",
    body: "Once the internet is handled, TV comes up on its own. You answer it with a package that fits the household.",
    image: "/redesign/v2/photos/tv-dusk-1600.webp",
    alt: "Wall-mounted television showing a blue abstract screen in a living room at dusk",
    position: "68% 50%",
    points: [
      "Sold in the same visit",
      "Packages sized to the home",
      "Runs on the connection you just sold",
    ],
  },
  {
    id: "security",
    number: "03",
    title: "Security Systems",
    accent: "Peace of mind, installed.",
    body: "Cameras, sensors, and a keypad, set up by a pro. You bring it up; most homeowners were already thinking about it.",
    image: "/redesign/v2/photos/security-dusk-1600.webp",
    alt: "Security keypad and door camera beside a front door at dusk",
    position: "62% 50%",
    points: [
      "Professional installation",
      "Works on the same connection",
      "Protects the customer you just signed",
    ],
  },
] as const;

const BUNDLE_POINTS = [
  "One monthly bill",
  "One point of contact: you",
  "Priority support for bundled homes",
];

export default function ServicesPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the head: flat navy, because there is no hero to be           */}
      {/*     transparent over on an interior page                          */}
      {/* ---------------------------------------------------------------- */}
      <header className={kit.pageHead}>
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>What you&apos;ll sell</p>
              <h1 className={kit.pageHeadTitle}>
                Three services.
                <br />
                One connection.
              </h1>
            </div>
            <p className={kit.pageHeadLede}>
              Fiber, TV, and security for every home on your route. One account,
              one rep.
            </p>
          </div>

          <div className={styles.headActions}>
            <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
              Start selling
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
            </Link>
            <a href="#fiber" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
              See what you&apos;ll sell
            </a>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — the filmstrip: curb, living room, front door                  */}
      {/* ---------------------------------------------------------------- */}
      <section id="what-you-sell" className={styles.sell} aria-labelledby="sell-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="sell-title" className={kit.sectionTitle}>
              Sold in
              <br />
              one visit.
            </h2>
            <p className={kit.sectionLede}>
              We partner with industry-leading providers to deliver fiber
              internet, TV, and security solutions that customers actually want —
              and that you can sell with confidence.
            </p>
          </header>
        </div>

        {/*
          Three full-bleed photographs of the same neighborhood at the same
          hour, butted together with a hairline between them so they read as one
          walk rather than three cards. The copy sits on the photograph on
          desktop under a scrim weighted to the copy's own side; below 900px the
          photograph becomes a band and the copy drops beneath it. The copy is on
          the left in all three because all three photographs put their subject
          on the right — alternating the side would have buried the fiber
          cabinet, the television and the keypad under their own scrim.
        */}
        <div className={styles.filmstrip}>
          {SERVICES.map((service, i) => (
            <article
              key={service.id}
              id={service.id}
              className={styles.band}
              aria-labelledby={`${service.id}-title`}
            >
              <div className={styles.bandArt}>
                {/*
                  P4 — the first band is already in the viewport at 1440, so it
                  is the route's LCP candidate and cannot be lazy. The two under
                  it stay lazy; the page head above carries no image of its own,
                  which is why the preload lands here rather than higher up.
                */}
                <Image
                  src={service.image}
                  alt={service.alt}
                  fill
                  priority={i === 0}
                  sizes="100vw"
                  className={styles.bandImage}
                  style={{ objectPosition: service.position }}
                />
                <div className={styles.bandScrim} aria-hidden="true" />
              </div>

              <div className={`${kit.shell} ${styles.bandShell}`}>
                <div className={`${styles.bandCopy} ${kit.revealRise}`} data-reveal>
                  <p className={styles.bandNumber}>{service.number}</p>
                  <h3 id={`${service.id}-title`} className={styles.bandTitle}>
                    {service.title}
                  </h3>
                  <p className={styles.bandAccent}>{service.accent}</p>
                  <p className={styles.bandBody}>{service.body}</p>
                  <ul className={styles.bandList}>
                    {service.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 3 — the light chapter: all three on one account                   */}
      {/* ---------------------------------------------------------------- */}
      <section id="bundle" className={styles.bundle} aria-labelledby="bundle-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="bundle-title" className={kit.sectionTitleInk}>
              One home. One bill.
              <br />
              One rep.
            </h2>
            <p className={kit.sectionLedeInk}>
              Fiber, TV, and security on a single account. Fewer bills for the
              customer. One relationship for you.
            </p>
          </header>

          <div className={styles.bundleLayout}>
            <div className={`${styles.bundleCopy} ${kit.revealRise}`} data-reveal>
              <ul className={styles.bundleList}>
                {BUNDLE_POINTS.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start selling
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
            </div>

            {/*
              The existing services artwork for this idea: one lit street with
              the run coming off it into a single house. It is a navy plate on
              the page's one paper chapter, so it is framed rather than bled.
            */}
            <div className={styles.bundlePlate}>
              <Image
                src="/redesign/services-r3/hero-h-1600.webp"
                alt="A lit suburban street at dusk with service lines running into one home"
                fill
                sizes="(max-width: 900px) 100vw, 46vw"
                className={styles.bundlePlateImage}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* 4 — closing, over the territory map the old page carried          */}
      {/* ---------------------------------------------------------------- */}
      <section id="closing" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/services-r3/bundle-map-q3-1536.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={styles.closingInner}>
          <h2 id="closing-title" className={styles.closingTitle}>
            Want to sell
            <br />
            <span className={styles.closingLime}>these services?</span>
          </h2>
          <p className={styles.closingLede}>
            Join 3C World Group and represent the solutions that power American
            homes — one connection at a time.
          </p>
          <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Apply now
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </Link>
        </div>
      </section>
    </>
  );
}
