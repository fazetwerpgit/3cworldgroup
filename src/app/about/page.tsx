import Image from "next/image";
import { Cable, Handshake, Waypoints } from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import ClosingCta from "@/components/public/ClosingCta";
import ThreeCGlyph from "@/components/art/ThreeCGlyph";
import USMap, { cityNode, type MapLink, type MapNode } from "@/components/art/USMap";
import { US_CITIES } from "@/components/art/usMapPaths";
import MissionRoute from "./MissionRoute";
import styles from "./about-page.module.css";

export const metadata = {
  title: "About Us | 3C World Group",
  description: "3C World Group connects sales professionals, customers, and trusted service providers across the country.",
};

const leaders = [
  ["JM", "Jeremy McFarland", "Founder & CEO"],
  ["WT", "William Teasdale", "Director of Sales"],
  ["JM", "Jacob Myers", "Operations"],
  ["BC", "Braeden Crouse", "Onboarding"],
] as const;

const values = [
  ["Connection", ["We connect customers with the", "services they need and build", "relationships that last."], "/redesign/about/value-connection-source.png"],
  ["Community", ["We foster a culture of respect,", "growth, and opportunity for our", "contractors and partners."], "/redesign/about/value-community-source.png"],
  ["Commitment", ["We are committed to integrity,", "excellence, and delivering outstanding", "results every day."], "/redesign/about/value-commitment-source.png"],
] as const;

function TvIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="5" y="7" width="38" height="27" rx="1" /><path d="M18 41h12M24 34v7" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 4 41 10v13c0 11-6 17-17 21C13 40 7 34 7 23V10z" /><path d="m15 24 7 7 12-14" /></svg>;
}

/** The Gulf hub the route leaves the map from. */
const ROUTE_ORIGIN = US_CITIES.houston;

const MAP_NODES: MapNode[] = [
  cityNode("sanFrancisco"),
  cityNode("losAngeles"),
  cityNode("phoenix"),
  cityNode("denver", true),
  cityNode("dallas", true),
  cityNode("chicago"),
  cityNode("atlanta"),
  cityNode("norfolk"),
  cityNode("houston"),
];

const MAP_LINKS: MapLink[] = [
  { from: "sanFrancisco", to: "denver", curve: 0.16 },
  { from: "sanFrancisco", to: "losAngeles", curve: 0.1 },
  { from: "losAngeles", to: "phoenix", curve: 0.12 },
  { from: "denver", to: "phoenix", curve: 0 },
  { from: "denver", to: "dallas", curve: 0 },
  { from: "denver", to: "chicago", curve: 0.14 },
  { from: "denver", to: "atlanta", curve: 0.16 },
  { from: "dallas", to: "chicago", curve: 0.14 },
  { from: "dallas", to: "atlanta", curve: 0.12 },
  { from: "dallas", to: "houston", curve: 0.1 },
  { from: "atlanta", to: "houston", curve: 0.14 },
  { from: "chicago", to: "norfolk", curve: 0.12 },
  { from: "atlanta", to: "norfolk", curve: 0.14 },
];

export default function AboutPage() {
  return <PageWrapper><div className={styles.page}>
    <section id="story" className={styles.hero} aria-labelledby="about-title">
      <div className={styles.heroInner}>
        <div className={styles.heroArt}><div className={styles.heroGlyph}><ThreeCGlyph title="Connected 3C map mark" idPrefix="about-hero" outline="#E4EAF2" outlineWidth={3} /></div></div>
        <div className={styles.heroCopy}><p className={styles.eyebrow}>Our story</p><h1 id="about-title" className={styles.title}><span className={styles.titleWhite}>We connect America.</span><span>One door at a time.</span></h1><p className={styles.intro}><span className={styles.introLine}>3C World Group is a nationwide face-to-face sales</span>{" "}<span className={styles.introLine}>organization specializing in customer acquisition</span>{" "}<span className={styles.introLine}>for telecommunications and security providers.</span></p><dl className={styles.stats}>{[["50+", "States served"], ["1,000+", "Contractors"], ["$5K+", "Weekly potential"], ["98%", "Satisfaction"]].map(([value, label]) => <div key={label}><dt>{value}</dt><dd>{label}</dd></div>)}</dl></div>
      </div>
    </section>

    <div className={styles.missionValues}><MissionRoute className={styles.routeOverlay} pathClassName={styles.routePath} originX={ROUTE_ORIGIN.x} originY={ROUTE_ORIGIN.y} />
      <section id="mission" className={styles.mission} aria-labelledby="mission-title"><div className={styles.missionInner}><div className={styles.missionCopy}><p className={styles.sectionEyebrow}>Our mission</p><h2 id="mission-title" className={styles.missionTitle}>Empowering sales professionals.<span>Building lasting connections.</span></h2><p className={styles.body}><span className={styles.missionBodyLine}>For more than 10+ years, 3C World Group has been</span>{" "}<span className={styles.missionBodyLine}>opening doors for top-tier brands and creating</span>{" "}<span className={styles.missionBodyLine}>opportunities for motivated professionals across</span>{" "}<span className={styles.missionBodyLine}>the country.</span></p><p className={styles.detail}>We empower sales professionals through training, support, and opportunity—helping them build rewarding careers while delivering exceptional service to customers.</p></div><div className={styles.missionMap} data-mission-map><USMap idPrefix="about-mission" insets="alaska" nodes={MAP_NODES} links={MAP_LINKS} title="3C territory connections across the United States" /></div></div></section>
      <section className={styles.values} aria-labelledby="values-title"><div className={styles.valuesInner}><h2 id="values-title" className={styles.valuesTitle}>The <span>3 C’s</span> that define us</h2><div className={styles.valuesGrid}>{values.map(([title, body, src]) => <article className={styles.value} key={title}><div className={styles.iconCircle} data-route-node>{title === "Connection" ? <Waypoints className={styles.connectionMark} aria-hidden="true" /> : title === "Community" ? <Handshake className={styles.communityMark} aria-hidden="true" /> : <Image src={src} alt="" width={100} height={90} />}</div><h3>{title}</h3><p>{body.map(line => <span key={line}>{line}</span>)}</p></article>)}</div></div></section>
    </div>

    <section id="leadership" className={styles.leadership} aria-labelledby="leadership-title"><div className={styles.leadershipInner}><p className={styles.eyebrow}>Leadership</p><h2 id="leadership-title">Built on experience. Driven by purpose.</h2><ul>{leaders.map(([initials, name, role]) => <li key={name}><span className={styles.initials}>{initials}</span><div><h3>{name}</h3><p>{role}</p></div></li>)}</ul></div></section>
      <section className={styles.audience} aria-labelledby="audience-title"><div className={styles.audienceInner}><h2 id="audience-title" className="sr-only">Who we serve</h2><article><p className={styles.sectionEyebrow}>For our customers</p><h3>Better services.<span>Built for your home.</span></h3><p className={styles.body}>We connect customers to the essential services they rely on—fiber, TV, and security—delivered by trusted providers with the quality and reliability they deserve.</p><ul className={styles.serviceList}><li><Cable className={styles.fiberMark} aria-hidden="true" />Fiber</li><li><TvIcon />TV</li><li><ShieldIcon />Security</li></ul></article><article><p className={styles.sectionEyebrow}>For our contractors</p><h3>Built for your success.<span>Backed every step.</span></h3><p className={styles.body}>We invest in our contractors with hands-on training, protected territories, and ongoing support so you can build a career with confidence and grow without limits.</p><ul className={styles.checkList}>{["Hands-on Training", "Protected Territories", "Ongoing Support"].map(item => <li key={item}><span>✓</span>{item}</li>)}</ul></article></div></section>
    <ClosingCta eyebrow="Ready to build your future?" title="Join the 3C team." body="" primaryLabel="Apply now" primaryHref="/apply" secondaryLabel="" secondaryHref="" />
  </div></PageWrapper>;
}
