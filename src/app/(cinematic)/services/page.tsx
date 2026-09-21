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
 * a navy bundle chapter, and a dark map close.
 */

const SERVICES = [
  {
    id: "fiber",
    number: "01",
    title: "Fiber Internet",
    accent: "The first question at most doors.",
    body: "Where fiber has been built on a route, you tell the household it is there, what it costs, and when it can be installed.",
    image: "/redesign/cinematic/fiber-pedestal-dusk-1920.webp",
    alt: "Fiber optic cable cabinet and spool beside a suburban street at dusk",
    position: "58% 62%",
    points: [
      "You know which streets are built and which are not",
      "Speed tiers and the monthly price, quoted at the door",
      "Install scheduled before you leave the porch",
    ],
  },
  {
    id: "tv",
    number: "02",
    title: "TV Services",
    accent: "The second question, if it fits.",
    body: "Once the internet is settled, some households want TV on the same bill. You lay out the packages and let them pick.",
    image: "/redesign/cinematic/tv-room-dusk-1920.webp",
    alt: "Living room at dusk with a wall-mounted television and the street outside the window",
    position: "60% 50%",
    points: [
      "Sold with the internet, one bill",
      "Channel packages by what they watch",
      "Not every door; only the ones that ask",
    ],
  },
  {
    id: "security",
    number: "03",
    title: "Security Systems",
    accent: "For the households that want it.",
    body: "Doorbell camera, door and window sensors, a keypad. Professionally installed, monitored monthly, sold when the household brings it up.",
    image: "/redesign/cinematic/security-keypad-dusk-1920.webp",
    alt: "Security keypad and door camera beside a front door at dusk",
    position: "62% 50%",
    points: [
      "Doorbell camera, sensors, keypad",
      "Professional install, monthly monitoring",
      "Runs on the same connection you just sold",
    ],
  },
] as const;

const BUNDLE_POINTS = [
  "Internet first, TV and security only if they fit",
  "One rep, one visit, one bill for the household",
  "Every term quoted at the door, then confirmed by the provider",
];

export default function ServicesPage() {
  return (
    <>
      {/* ---------------------------------------------------------------- */}
      {/* 1 — the head: beside a front door at arm's length, a lit sconce  */}
      {/*     and a video doorbell at the frame; the wall the headline sits */}
      {/*     on is the dark clapboard at the left                          */}
      {/* ---------------------------------------------------------------- */}
      <header className={`${kit.pageHead} ${styles.head}`}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/cinematic/services-door-dusk-1920.webp"
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
              Fiber internet, TV and home security, sold at the door. Three products,
              one conversation, and you learn all three before your first route.
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
              Fiber internet, TV and home security, each from the provider that serves
              that market. You sell what is actually available on the street you are on.
            </p>
          </header>
        </div>

        <div className={styles.filmstrip}>
          {SERVICES.map((service, i) => (
            /* One entrance per row, fired once when the row itself enters view.
               The photograph leads and the whole text column follows 80ms later;
               services.module.css owns the two steps. */
            <article
              key={service.id}
              id={service.id}
              className={styles.band}
              aria-labelledby={`${service.id}-title`}
              data-reveal
            >
              {/*
                Band 01 carries the page head's photograph: the v2 set has one
                fiber frame with a street in it and the head is pinned to it.
                `bandArtTight` pushes this one in on the pedestal, the tool bag
                and the spool, so the row is a detail of the walk the head
                establishes rather than the same picture printed twice.
              */}
              {/* The photograph fades up inside a frame that never moves, so the
                  band keeps its height and its crop. */}
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
                {/* The column moves as ONE unit — number, title, sentence and the
                    three points together. No internal stagger: the row is one
                    exhibit, not five paragraphs each starting their own animation. */}
                <div className={styles.bandCopy}>
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
      {/* 3 — the bundle chapter, on navy                                  */}
      {/* ---------------------------------------------------------------- */}
      <section id="bundle" className={styles.bundle} aria-labelledby="bundle-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="bundle-title" className={kit.sectionTitle}>
              One home.
              <br />
              A clearer setup.
            </h2>
            <p className={kit.sectionLede}>
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
              {/* A quiet link, not a lime button: the closer one section down
                  carries this page's last Apply, and two lime buttons a screen
                  apart read as the page asking twice. */}
              <Link href={APPLY_HREF} className={kit.quietLink}>
                Start selling
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
              </Link>
            </div>

            {/*
              The street at dusk, cropped in on the one house with the lime
              service cable running up its walk: one home, the whole setup. A
              photograph, not a diagram — the earlier plate drew the idea in
              light trails, which is the one thing this site never does. A
              framed plate on the navy bundle chapter, not bled.
            */}
            <div className={styles.bundlePlate}>
              <Image
                src="/redesign/cinematic/bundle-porch-dusk-1920.webp"
                alt="A front porch at dusk: doorbell camera by the door, a fiber service box on the wall, and a television glowing through the window"
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
          src="/redesign/cinematic/services-aerial-dusk-1920.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={styles.closingInner}>
          <div>
            <h2 id="closing-title" className={styles.closingTitle}>
              Want to sell these services?
              <br />
              <span className={styles.closingLime}>Start here.</span>
            </h2>
            <p className={styles.closingLede}>
              Fiber, TV and home security, sold at the door on a route in one of our
              markets. Training included. No experience needed.
            </p>
          </div>
          <Link href={APPLY_HREF} className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Apply now
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </Link>
        </div>
      </section>
    </>
  );
}
