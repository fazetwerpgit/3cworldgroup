import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import ServicesConnector from "@/components/public/services/ServicesConnector";
import styles from "@/components/public/services/services.module.css";

export const metadata = {
  title: "Our Services | 3C World Group",
  description:
    "Explore fiber internet, TV, and security solutions from 3C World Group.",
};

const serviceSections = [
  {
    id: "fiber",
    number: "01",
    title: "Fiber Internet",
    accent: "THE ONE EVERYONE'S WAITING FOR.",
    body: "When fiber reaches a street, the whole block wants in. You're the person at the door with the answer.",
    image: "/redesign/v2/photos/fiber-dusk-1600.webp",
    imageWidth: 1600,
    imageHeight: 1067,
    alt: "Fiber optic cable cabinet and spool beside a suburban street at dusk",
    bullets: [
      "Customers already want it",
      "One conversation, one install date",
      "A connection they'll keep for years",
    ],
    cta: "START SELLING",
  },
  {
    id: "tv",
    number: "02",
    title: "TV Services",
    accent: "THE NATURAL NEXT QUESTION.",
    body: "Once the internet is handled, TV comes up on its own. You answer it with a package that fits the household.",
    image: "/redesign/v2/photos/tv-dusk-1600.webp",
    imageWidth: 1600,
    imageHeight: 1067,
    alt: "Wall-mounted television showing a blue abstract screen in a living room at dusk",
    bullets: [
      "Sold in the same visit",
      "Packages sized to the home",
      "Runs on the connection you just sold",
    ],
    cta: "START SELLING",
  },
  {
    id: "security",
    number: "03",
    title: "Security Systems",
    accent: "PEACE OF MIND, INSTALLED.",
    body: "Cameras, sensors, and a keypad, set up by a pro. You bring it up; most homeowners were already thinking about it.",
    image: "/redesign/v2/photos/security-dusk-1600.webp",
    imageWidth: 1600,
    imageHeight: 1067,
    alt: "Security keypad and door camera beside a front door at dusk",
    bullets: [
      "Professional installation",
      "Works on the same connection",
      "Protects the customer you just signed",
    ],
    cta: "START SELLING",
  },
] as const;

export default function ServicesPage() {
  return (
    <PageWrapper>
      <div className={styles.page}>
        <ServicesConnector>
          <section
            className={styles.hero}
            aria-labelledby="services-hero-heading"
          >
            <div className={`public-container ${styles.heroInner}`}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>WHAT YOU&apos;LL SELL</p>
                <h1 id="services-hero-heading" className={styles.heroTitle}>
                  Three services.
                  <span>One connection.</span>
                </h1>
                <p className={styles.heroLead}>
                  Fiber, TV, and security for every home on your route. One
                  account, one rep.
                </p>
                <p className={styles.heroBody}>
                  <span className={styles.heroBodyDesktop}>
                    We partner with industry-leading providers to deliver
                    <br />
                    fiber internet, TV, and security solutions that
                    <br />
                    customers actually want — and that you can sell
                    <br />
                    with confidence.
                  </span>
                  <span className={styles.heroBodyMobile}>
                    We partner with industry-leading providers to deliver fiber
                    internet, TV, and security solutions that customers actually
                    want — and that you can sell with confidence.
                  </span>
                </p>
                <div className={styles.heroActions}>
                  <Link href="/apply" className={styles.serviceCta}>
                    Start selling
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                  <a
                    href="#fiber"
                    className={`${styles.serviceCta} ${styles.heroCtaSecondary}`}
                  >
                    See what you&apos;ll sell
                  </a>
                </div>
              </div>
              <div className={styles.mapPanel}>
                <div className={styles.heroArt}>
                  <Image
                    src="/redesign/services-r3/hero-h-1600.webp"
                    alt=""
                    fill
                    priority
                    sizes="(max-width: 720px) 100vw, 55vw"
                    className={styles.heroArtImage}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className={styles.serviceList}>
            {serviceSections.map(
              ({
                id,
                number,
                title,
                accent,
                body,
                image,
                imageWidth,
                imageHeight,
                alt,
                bullets,
                cta,
              }) => (
                <section
                  id={id}
                  key={id}
                  aria-labelledby={`${id}-heading`}
                  className={styles.serviceSection}
                  data-service-section={id}
                  data-cut-row
                >
                  <div className={styles.serviceSectionInner}>
                    <div className={styles.serviceCopy}>
                      <p className={styles.serviceNumber}>{number}</p>
                      <h2 id={`${id}-heading`} className={styles.serviceTitle}>
                        {title}
                      </h2>
                      <p className={styles.serviceAccent}>{accent}</p>
                      <p className={styles.serviceBody}>{body}</p>
                      <ul className={styles.serviceBullets}>
                        {bullets.map((bullet) => (
                          <li key={bullet} className={styles.serviceBullet}>
                            <CheckCircle2
                              aria-hidden="true"
                              size={18}
                              strokeWidth={2.2}
                            />
                            <span>{bullet}</span>
                          </li>
                        ))}
                      </ul>
                      <Link href="/apply" className={styles.serviceCta}>
                        {cta}
                        <ArrowRight
                          aria-hidden="true"
                          size={18}
                          strokeWidth={2.2}
                        />
                      </Link>
                    </div>
                    <div className={styles.serviceArtwork}>
                      <Image
                        src={image}
                        alt={alt}
                        width={imageWidth}
                        height={imageHeight}
                        loading="eager"
                        className={styles.serviceArtworkImage}
                        sizes="(max-width: 767px) 100vw, (max-width: 1023px) 60vw, 65vw"
                      />
                    </div>
                  </div>
                </section>
              ),
            )}
          </div>

          <section
            id="bundle"
            className={styles.bundle}
            aria-labelledby="bundle-heading"
            data-cut-row
          >
            <div className={styles.bundleInner}>
              <div className={styles.bundleCopy}>
                <h2 id="bundle-heading" className={styles.bundleTitle}>
                  ONE HOME. ONE BILL.
                  <br />
                  ONE REP.
                </h2>
                <p className={styles.serviceAccent}>
                  Fiber, TV, and security on a single account.
                </p>
                <p className={styles.serviceBody}>
                  Fewer bills for the customer. One relationship for you.
                </p>
                <ul className={styles.serviceBullets}>
                  {[
                    "One monthly bill",
                    "One point of contact: you",
                    "Priority support for bundled homes",
                  ].map((value) => (
                    <li key={value} className={styles.serviceBullet}>
                      <CheckCircle2
                        aria-hidden="true"
                        size={18}
                        strokeWidth={2.2}
                      />
                      <span>{value}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/apply" className={styles.serviceCta}>
                  START SELLING{" "}
                  <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                </Link>
              </div>
              <div className={styles.bundleArtwork}>
                <Image
                  src="/redesign/services-r3/bundle-map-q3-1536.webp"
                  alt="Connected service territory map"
                  fill
                  loading="eager"
                  className={styles.bundleImage}
                  sizes="(max-width: 767px) 100vw, 60vw"
                />
              </div>
            </div>
          </section>

          <section
            className={styles.recruiting}
            aria-labelledby="recruiting-heading"
          >
            <div className={styles.recruitingInner}>
              <h2 id="recruiting-heading" className={styles.recruitingTitle}>
                Want to sell
                <br />
                <span>these services?</span>
              </h2>
              <p className={styles.recruitingBody}>
                <span className={styles.recruitingBodyDesktop}>
                  Join 3C World Group and represent the solutions that
                  power American homes — one connection at a time.
                </span>
                <span className={styles.recruitingBodyMobile}>
                  Join 3C World Group and represent the solutions that power
                  American homes — one connection at a time.
                </span>
              </p>
              <div className={styles.recruitingCtaGroup}>
                <Link href="/apply" className={styles.recruitingCta}>
                  Apply now{" "}
                  <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                </Link>
              </div>
            </div>
          </section>
        </ServicesConnector>
      </div>
    </PageWrapper>
  );
}
