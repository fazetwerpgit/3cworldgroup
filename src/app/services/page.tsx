import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  Equal,
  House,
  Plus,
  ShieldCheck,
  Tv,
  Video,
  Wifi,
  Wrench,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import ServicesConnector from "@/components/public/services/ServicesConnector";
import styles from "@/components/public/services/services.module.css";

export const metadata = {
  title: "Our Services | 3C World Group",
  description: "Explore fiber internet, TV, and security solutions from 3C World Group.",
};

const serviceSections = [
  {
    id: "fiber",
    number: "01",
    eyebrow: "High-speed connectivity",
    title: "Fiber Internet",
    accent: "Built for speed.",
    body: "Reliable, high-speed fiber internet that keeps homes, teams, and everyday life moving without compromise.",
    image: "/redesign/service-fiber-2x.png",
    alt: "Abstract blue and lime fiber light trails",
    icon: Wifi,
    bullets: ["Up to 1 Gbps speeds", "Blazing-fast performance", "99.9% network uptime", "No data caps", "Symmetrical upload and download"],
    cta: "Check availability",
    reverse: false,
  },
  {
    id: "tv",
    number: "02",
    eyebrow: "Flexible entertainment",
    title: "TV Services",
    accent: "Entertainment your way.",
    body: "Flexible, feature-rich TV that brings people together with clear picture quality and a lineup built around how you watch.",
    image: "/redesign/service-tv-2x.png",
    alt: "Unbranded television and tablet displaying abstract channels and content",
    icon: Tv,
    bullets: ["500+ channels", "HD and 4K quality", "Cloud DVR included", "Watch anywhere", "Family-safe controls"],
    cta: "View packages",
    reverse: true,
  },
  {
    id: "security",
    number: "03",
    eyebrow: "Home and business protection",
    title: "Security Systems",
    accent: "Protect what matters.",
    body: "Smart, reliable protection that gives customers confidence with responsive monitoring and connected controls.",
    image: "/redesign/service-security-2x.png",
    alt: "Unbranded security camera, keypad, sensors, and hub",
    icon: ShieldCheck,
    bullets: ["24/7 monitoring", "Smart-home integration", "HD cameras", "Professional installation"],
    cta: "Get protected",
    reverse: false,
  },
] as const;

const securityHighlights = [
  ["24/7 monitoring", Clock3],
  ["Smart-home integration", House],
  ["HD cameras", Video],
  ["Professional installation", Wrench],
] as const;

const bundleFeatures = [
  ["Fiber Internet", Wifi],
  ["TV Services", Tv],
  ["Security Systems", ShieldCheck],
] as const;

function ServiceAnchorIcon({ icon: Icon, anchor }: { icon: typeof Wifi; anchor: string }) {
  return (
    <span className={styles.navMarker} data-service-anchor={anchor}>
      <Icon aria-hidden="true" size={18} strokeWidth={2.1} />
    </span>
  );
}

function ServiceRowMarker({ icon: Icon, anchor }: { icon: typeof Wifi; anchor: string }) {
  return (
    <span aria-hidden="true" className={styles.rowMarker} data-service-anchor={anchor}>
      <Icon aria-hidden="true" size={20} strokeWidth={2.1} />
    </span>
  );
}

export default function ServicesPage() {
  return (
    <PageWrapper>
      <div className={styles.page}>
        <ServicesConnector>
          <section className={styles.hero} aria-labelledby="services-hero-heading">
            <div className={`public-container ${styles.heroInner}`}>
              <div className={styles.heroCopy}>
                <p className={styles.eyebrow}>Our solutions</p>
                <h1 id="services-hero-heading" className={styles.heroTitle}>
                  Premium Services.
                  <span>Real Results.</span>
                </h1>
                <p className={styles.heroBody}>
                  We partner with trusted providers to deliver fiber internet, TV, and security solutions that customers want and teams can sell with confidence.
                </p>
              </div>
              <div className={styles.mapPanel}>
                <div className={styles.mapCanvas}>
                  <Image
                    src="/redesign/services-hero-map-source.png"
                    alt="Illustrated service territory map with connected service routes"
                    fill
                    priority
                    unoptimized
                    className={styles.mapImage}
                    sizes="(max-width: 767px) 100vw, 50vw"
                  />
                  <span className={`${styles.mapNode} ${styles.mapNodeFiber}`}>
                    <span className={styles.mapAnchor} />
                    <span className={styles.mapNodeLabel}>Fiber</span>
                  </span>
                  <span className={`${styles.mapNode} ${styles.mapNodeTv}`}>
                    <span className={styles.mapAnchor} />
                    <span className={styles.mapNodeLabel}>TV</span>
                  </span>
                  <span className={`${styles.mapNode} ${styles.mapNodeSecurity}`}>
                    <span aria-hidden="true" className={styles.mapAnchor} data-service-anchor="hero-security" />
                    <span className={styles.mapNodeLabel}>Security</span>
                  </span>
                </div>
              </div>
            </div>
          </section>

          <section className={styles.overview} aria-labelledby="services-connection-heading">
            <div className={`public-container ${styles.overviewInner}`}>
              <h2 id="services-connection-heading" className={styles.overviewTitle}>
                Three services. <span>One connection.</span>
              </h2>
              <nav aria-label="Service sections" className={styles.serviceNav}>
                {serviceSections.map(({ id, title, icon: Icon }) => (
                  <a key={id} href={`#${id}`} className={styles.serviceNavLink}>
                    <ServiceAnchorIcon icon={Icon} anchor={`overview-${id}`} />
                    <span className={styles.navLabel}>{title.split(" ")[0]}</span>
                  </a>
                ))}
              </nav>
            </div>
          </section>

          <div>
            {serviceSections.map(({ id, number, eyebrow, title, accent, body, image, alt, icon: Icon, bullets, cta, reverse }) => (
              <section
                id={id}
                key={id}
                aria-labelledby={`${id}-heading`}
                className={`${styles.serviceSection} ${reverse ? styles.serviceSectionReverse : ""}`}
                data-service-section={id}
              >
                <div className={`public-container ${styles.serviceSectionInner}`}>
                  <div className={styles.serviceCopy}>
                    <ServiceRowMarker icon={Icon} anchor={id} />
                    <p className={styles.serviceNumber}>{number}</p>
                    <p className={styles.sectionEyebrow}>{eyebrow}</p>
                    <h2 id={`${id}-heading`} className={styles.serviceTitle}>{title}</h2>
                    <p className={styles.serviceAccent}>{accent}</p>
                    <p className={styles.serviceBody}>{body}</p>
                    <ul className={styles.serviceBullets}>
                      {bullets.map((bullet) => (
                        <li key={bullet} className={styles.serviceBullet}>
                          <CheckCircle2 aria-hidden="true" size={18} strokeWidth={2.2} />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/contact" className={styles.serviceCta}>
                      {cta}
                      <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                    </Link>
                  </div>
                  <div className={`${styles.serviceArtwork} ${id === "tv" ? styles.serviceArtworkTv : ""}`}>
                    <Image
                      src={image}
                      alt={alt}
                      fill
                      loading="eager"
                      unoptimized
                      className={styles.serviceArtworkImage}
                      sizes="(max-width: 767px) 100vw, (max-width: 1023px) 54vw, 58vw"
                    />
                    {id === "security" ? (
                      <div className={styles.securityHighlights} aria-label="Security highlights">
                        {securityHighlights.map(([label, HighlightIcon]) => (
                          <span key={label} className={styles.securityHighlight}>
                            <HighlightIcon aria-hidden="true" size={17} strokeWidth={1.8} />
                            {label}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </section>
            ))}
          </div>

          <section id="bundle" className={styles.bundle} aria-labelledby="bundle-heading">
            <div className={`public-container ${styles.bundleInner}`}>
              <div className={styles.bundleCopy}>
                <p className={styles.sectionEyebrow}>Maximum value</p>
                <h2 id="bundle-heading" className={styles.bundleTitle}>Bundle &amp; save big.</h2>
                <p className={styles.bundleDescription}>Bring internet, TV, and security together for a simpler experience and better value.</p>
                <div className={styles.bundleEquation} aria-label="Fiber internet plus TV services plus security systems equals up to 30 percent savings">
                  {bundleFeatures.map(([label, Icon], index) => (
                    <span key={label} className={styles.bundleItem}>
                      <span className={styles.bundleItemIcon}><Icon aria-hidden="true" size={21} strokeWidth={1.8} /></span>
                      {label}
                      {index < 2 ? <span aria-hidden="true" className={styles.bundleOperator}><Plus size={18} /></span> : null}
                    </span>
                  ))}
                  <span aria-hidden="true" className={styles.bundleOperator}><Equal size={19} /></span>
                  <span className={styles.bundleSavings} data-service-anchor="bundle-savings">
                    <small>Up to</small>
                    <strong>30%</strong>
                    <small>Savings</small>
                  </span>
                </div>
                <div className={styles.bundleStats}>
                  {[["Up to 30%", "bundle savings"], ["One bill", "simple monthly service"], ["Priority", "customer support"]].map(([value, label]) => (
                    <div key={value} className={styles.bundleStat}>
                      <strong>{value}</strong>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
                <Link href="/contact" className={styles.serviceCta}>
                  Get a quote <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
                </Link>
              </div>
              <div className={styles.bundleArtwork}>
                <Image
                  src="/redesign/services-bundle-map-source.png"
                  alt="Connected service territory map"
                  fill
                  loading="eager"
                  unoptimized
                  className={styles.bundleImage}
                  sizes="(max-width: 767px) 100vw, 50vw"
                />
              </div>
            </div>
          </section>

          <section className={styles.recruiting} aria-labelledby="recruiting-heading">
            <div className={`public-container ${styles.recruitingInner}`}>
              <div>
                <p className={styles.eyebrow}>For people who want momentum</p>
                <h2 id="recruiting-heading" className={styles.recruitingTitle}>Want to sell<br />these services?</h2>
                <p className={styles.recruitingBody}>Join a recruiting-first team with practical training, a protected market, and a clear next step.</p>
              </div>
              <Link href="/apply" className={styles.recruitingCta}>
                <span aria-hidden="true" className={styles.recruitingAnchor} data-service-anchor="recruiting-apply" />
                Apply now <ArrowRight aria-hidden="true" size={18} strokeWidth={2.2} />
              </Link>
            </div>
          </section>
        </ServicesConnector>
      </div>
    </PageWrapper>
  );
}
