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
 * The composition pairs a photographic hero with three light editorial rows,
 * a paper bundle chapter, and a dark map close.
 */

const SERVICES = [
  {
    id: "fiber",
    number: "01",
    title: "Fiber Internet",
    accent: "A strong fit for connected homes.",
    body: "When fiber is available on a route, you can help each household decide whether the connection fits.",
    image: "/redesign/v2/photos/fiber-dusk-1600.webp",
    alt: "Fiber optic cable cabinet and spool beside a suburban street at dusk",
    position: "58% 62%",
    points: [
      "Start with what the household needs",
      "A clear conversation about the connection",
      "A setup designed for the long haul",
    ],
  },
  {
    id: "tv",
    number: "02",
    title: "TV Services",
    accent: "A natural next question.",
    body: "Once internet is covered, TV may fit the household too. You can help compare the available options.",
    image: "/redesign/v2/photos/tv-dusk-1600.webp",
    alt: "Wall-mounted television showing a blue abstract screen in a living room at dusk",
    position: "60% 50%",
    points: [
      "Offer it when it fits the home",
      "Packages sized to the household",
      "Works alongside the connection",
    ],
  },
  {
    id: "security",
    number: "03",
    title: "Security Systems",
    accent: "Practical protection for the home.",
    body: "Cameras, sensors, and a keypad can be part of the conversation when a household wants another layer of protection.",
    image: "/redesign/v2/photos/security-dusk-1600.webp",
    alt: "Security keypad and door camera beside a front door at dusk",
    position: "62% 50%",
    points: [
      "Professional installation options",
      "Designed to work with the connection",
      "A considered fit for the household",
    ],
  },
] as const;

const BUNDLE_POINTS = [
  "A simpler way to consider the full setup",
  "One point of contact through the conversation",
  "Options matched to the household",
];

export default function ServicesPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the head: the pedestal at dusk, close, with the street soft   */}
      {/*     behind it; band 01 below is the same object at working       */}
      {/*     distance, so the two read as two beats of one walk           */}
      {/* ---------------------------------------------------------------- */}
      <header className={`${kit.pageHead} ${styles.head}`}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/cinematic/services-pedestal-dusk-1920.webp"
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
            <p className={kit.pageHeadEyebrow}>What you&apos;ll sell</p>
            <h1 className={kit.pageHeadTitle}>
              Three services.
              <span className={kit.pageHeadLime}>One connection.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              Fiber, TV, and security options for homes on your route. A focused
              conversation for each household.
            </p>
            <div className={kit.pageHeadActions}>
              <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start selling
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
              <a href="#fiber" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                See what you&apos;ll sell
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------------- */}
      {/* 2 — editorial service rows                                       */}
      {/* ---------------------------------------------------------------- */}
      <section id="what-you-sell" className={styles.sell} aria-labelledby="sell-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="sell-title" className={kit.sectionTitleInk}>
              Services that fit
              <br />
              the home.
            </h2>
            <p className={kit.sectionLedeInk}>
              We partner with leading providers to offer fiber internet, TV, and
              security options that can be matched to the household in front of you.
            </p>
          </header>
        </div>

        <div className={styles.filmstrip}>
          {SERVICES.map((service, i) => (
            <article
              key={service.id}
              id={service.id}
              className={styles.band}
              aria-labelledby={`${service.id}-title`}
            >
              {/*
                Band 01 carries the page head's photograph: the v2 set has one
                fiber frame with a street in it and the head is pinned to it.
                `bandArtTight` pushes this one in on the pedestal, the tool bag
                and the spool, so the row is a detail of the walk the head
                establishes rather than the same picture printed twice.
              */}
              <div className={i === 0 ? `${styles.bandArt} ${styles.bandArtTight}` : styles.bandArt}>
                <Image
                  src={service.image}
                  alt={service.alt}
                  fill
                  sizes="(max-width: 900px) 100vw, 46vw"
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
      {/* 3 — the light bundle chapter                                    */}
      {/* ---------------------------------------------------------------- */}
      <section id="bundle" className={styles.bundle} aria-labelledby="bundle-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="bundle-title" className={kit.sectionTitleInk}>
              One home.
              <br />
              A clearer setup.
            </h2>
            <p className={kit.sectionLedeInk}>
              Fiber, TV, and security can come together when they suit the
              household. You guide the conversation from first question to next step.
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
      {/* 4 — closing, over a second aerial: a different neighbourhood      */}
      {/* ---------------------------------------------------------------- */}
      <section id="closing" className={styles.closing} aria-labelledby="closing-title">
        <Image
          src="/redesign/cinematic/aerial-dusk-1920.webp"
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
            Fiber, TV and home security, sold at the door on a route in one of our
            markets. Training included. No experience needed.
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
