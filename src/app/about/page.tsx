import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";
import ClosingCta from "@/components/public/ClosingCta";
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

function FiberIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M6 34c3 4 8 5 12 1l8-9" /><path d="m7 29 7-7 8 7-7 8z" /><path className={styles.fiberStrand} d="m17 30 12-13 10-8M21 35l11-13 9-8M25 39l11-12 8-6" /></svg>;
}

function TvIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><rect x="6" y="9" width="36" height="25" rx="1" /><path d="M18 41h12M24 34v7" /></svg>;
}

function ShieldIcon() {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 40 11v12c0 10-6 16-16 20C14 39 8 33 8 23V11z" /><path d="m16 24 6 6 11-12" /></svg>;
}

function RouteOverlay() {
  return <svg className={styles.routeOverlay} viewBox="0 0 1440 1258" preserveAspectRatio="none" aria-hidden="true"><path className={styles.routePath} d="M1020 616C1020 700 1044 759 1082 807c33 41 48 75 48 133V940H1282l53 36h105M258 940H1282" /><circle cx="258" cy="940" r="7" /><circle cx="712" cy="940" r="7" /><circle cx="1130" cy="940" r="7" /></svg>;
}

export default function AboutPage() {
  return <PageWrapper><div className={styles.page}>
    <section id="story" className={styles.hero} aria-labelledby="about-title">
      <div className={styles.heroInner}>
        <div className={styles.heroArt}><Image src="/redesign/about-hero-lock-art.png" alt="Connected 3C map mark" fill priority sizes="650px" /></div>
        <div className={styles.heroCopy}><p className={styles.eyebrow}>Our story</p><h1 id="about-title" className={styles.title}><span className={styles.titleWhite}>We connect America.</span><span>One door at a time.</span></h1><p className={styles.intro}>3C World Group is a nationwide face-to-face sales organization specializing in customer acquisition for telecommunications and security providers.</p><dl className={styles.stats}>{[["50+", "States served"], ["1,000+", "Contractors"], ["$5K+", "Weekly potential"], ["98%", "Satisfaction"]].map(([value, label]) => <div key={label}><dt>{value}</dt><dd>{label}</dd></div>)}</dl></div>
      </div>
    </section>

    <div className={styles.missionValues}><RouteOverlay />
      <section id="mission" className={styles.mission} aria-labelledby="mission-title"><div className={styles.missionInner}><div className={styles.missionCopy}><p className={styles.sectionEyebrow}>Our mission</p><h2 id="mission-title" className={styles.missionTitle}>Empowering sales professionals.<span>Building lasting connections.</span></h2><p className={styles.body}>For more than 10+ years, 3C World Group has been opening doors for top-tier brands and creating opportunities for motivated professionals across the country.</p><p className={styles.detail}>We empower sales professionals through training, support, and opportunity—helping them build rewarding careers while delivering exceptional service to customers.</p></div><div className={styles.missionMap}><Image src="/redesign/about-mission-map-source.png" alt="3C territory connections across the United States" fill sizes="966px" /></div></div></section>
      <section className={styles.values} aria-labelledby="values-title"><div className={styles.valuesInner}><h2 id="values-title" className={styles.valuesTitle}>The <span>3 C’s</span> that define us</h2><div className={styles.valuesGrid}>{values.map(([title, body, src]) => <article className={styles.value} key={title}><div className={styles.iconCircle}><Image src={src} alt="" width={100} height={90} /></div><h3>{title}</h3><p>{body.map(line => <span key={line}>{line}</span>)}</p></article>)}</div></div></section>
    </div>

    <section id="leadership" className={styles.leadership} aria-labelledby="leadership-title"><div className={styles.leadershipInner}><p className={styles.eyebrow}>Leadership</p><h2 id="leadership-title">Built on experience. Driven by purpose.</h2><ul>{leaders.map(([initials, name, role]) => <li key={name}><span className={styles.initials}>{initials}</span><div><h3>{name}</h3><p>{role}</p></div></li>)}</ul></div></section>
    <section className={styles.audience} aria-labelledby="audience-title"><div className={styles.audienceInner}><h2 id="audience-title" className="sr-only">Who we serve</h2><article><p className={styles.sectionEyebrow}>For our customers</p><h3>Better services.<span>Built for your home.</span></h3><p className={styles.body}>We connect customers to the essential services they rely on—fiber, TV, and security—delivered by trusted providers with the quality and reliability they deserve.</p><ul className={styles.serviceList}><li><FiberIcon />Fiber</li><li><TvIcon />TV</li><li><ShieldIcon />Security</li></ul></article><article><p className={styles.sectionEyebrow}>For our contractors</p><h3>Built for your success.<span>Backed every step.</span></h3><p className={styles.body}>We invest in our contractors with hands-on training, protected territories, and ongoing support so you can build a career with confidence and grow without limits.</p><ul className={styles.checkList}>{["Hands-on Training", "Protected Territories", "Ongoing Support"].map(item => <li key={item}><span>✓</span>{item}</li>)}</ul></article></div></section>
    <ClosingCta eyebrow="Ready to build your future?" title="Join the 3C team." body="" primaryLabel="Apply now" primaryHref="/apply" secondaryLabel="" secondaryHref="" />
  </div></PageWrapper>;
}
