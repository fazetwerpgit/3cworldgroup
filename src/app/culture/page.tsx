import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Award, BookOpen, ClipboardCheck, GraduationCap, Handshake, LifeBuoy, MessageCircle, PhoneCall, ShieldCheck, TrendingUp, UsersRound } from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import ClosingCta from "@/components/public/ClosingCta";
import styles from "./culture-page.module.css";

const values = [["Connection", "We connect customers with the services they need and build relationships that last.", Handshake], ["Community", "We foster a culture of respect, growth, and opportunity for our contractors and partners.", UsersRound], ["Commitment", "We are committed to integrity, excellence, and delivering outstanding results every day.", ShieldCheck]] as const;
const operatingValues = [["01", "Respect", "We treat everyone with honesty and dignity—customers, partners, and teammates.", ShieldCheck], ["02", "Quality", "We take pride in doing the job right the first time and raising the bar every day.", Award], ["03", "Teamwork", "We collaborate, support, and win together by putting the customer first.", Handshake], ["04", "Growth", "We invest in learning, embrace challenges, and pursue continuous improvement.", TrendingUp]] as const;
const rhythm = [["Weekly team calls", "We stay aligned, share insights, and celebrate wins together.", PhoneCall], ["Mentorship", "Experienced leaders are here to guide, support, and help you grow.", GraduationCap], ["Recognition programs", "We celebrate results and recognize the effort behind them.", Award], ["Community events", "Regional meetups and annual conferences.", UsersRound], ["Ongoing training", "We provide the tools and training you need to grow and succeed.", BookOpen], ["Open communication", "We value feedback and keep the lines open—always.", MessageCircle]] as const;
const opportunities = [["Get prepared", "Ongoing training gives you the tools and knowledge to start with confidence.", ClipboardCheck], ["Stay supported", "Weekly calls, mentorship, and open communication keep you connected.", LifeBuoy], ["Grow through results", "Recognition and advancement follow consistent performance and available opportunities.", TrendingUp]] as const;

export default function CulturePage() {
  return (
    <PageWrapper>
      <div className={styles.page}>
        <section className={styles.topo} aria-labelledby="culture-title"><div className={`${styles.inner} ${styles.heroGrid}`}><div className={styles.heroCopy}><p className={styles.eyebrow}>Who we are</p><h1 id="culture-title" className={styles.heroTitle}>Built to succeed.<span>Together.</span></h1><p className={styles.heroBody}>Our culture is built on shared values that guide how we connect, serve, and grow.</p><Link href="/apply" className={`${styles.button} ${styles.heroButton}`}>Join our team <ArrowRight aria-hidden="true" size={17} /></Link></div><div className={styles.heroArt}><Image src="/redesign/three-c-map-mark-transparent-2x.png" alt="" aria-hidden="true" width={3172} height={1984} priority sizes="(max-width: 600px) 100vw, clamp(800px, 86vw, 1240px)" /></div></div></section>

        <section className={`${styles.section} ${styles.white}`} aria-labelledby="values-title"><div className={styles.inner}><div className={styles.headingCenter}><p className={styles.sectionEyebrow}>The values that drive us</p><h2 id="values-title" className={styles.sectionTitle}>The 3 C’s that drive us</h2></div><div className={styles.valuesGrid}>{values.map(([title, body, Icon]) => <article className={styles.value} key={title}><Icon className={styles.valueIcon} aria-hidden="true" focusable="false" strokeWidth={1.5} /><h3 className={styles.cardTitle}>{title}</h3><p className={styles.cardBody}>{body}</p></article>)}</div></div></section>

        <section className={`${styles.section} ${styles.navy}`} aria-labelledby="operate-title"><div className={styles.inner}><div className={styles.headingCenter}><p className={styles.sectionEyebrow}>The everyday standard</p><h2 id="operate-title" className={styles.sectionTitle}>How we operate</h2></div><div className={styles.operatingGrid}>{operatingValues.map(([number, title, body, Icon]) => <article className={styles.operating} key={number}><p className={styles.number}>{number}</p><Icon className={styles.operatingIcon} aria-hidden="true" focusable="false" strokeWidth={1.5} /><h3 className={styles.operatingTitle}>{title}</h3><p className={styles.operatingBody}>{body}</p></article>)}</div></div></section>

        <section className={`${styles.section} ${styles.white}`} aria-labelledby="rhythm-title"><div className={styles.inner}><div className={styles.headingCenter}><p className={styles.sectionEyebrow}>The cadence behind the work</p><h2 id="rhythm-title" className={styles.sectionTitle}>The rhythm of <span>life</span> at 3C</h2></div><div className={styles.rhythmGrid}>{rhythm.map(([title, body, Icon]) => <article className={styles.rhythm} key={title}><Icon className={styles.rhythmIcon} aria-hidden="true" focusable="false" strokeWidth={1.5} /><div><h3 className={styles.rhythmTitle}>{title}</h3><p className={styles.rhythmBody}>{body}</p></div></article>)}</div></div></section>

        <section className={`${styles.section} ${styles.navy}`} aria-labelledby="satisfaction-title"><div className={`${styles.inner} ${styles.satisfaction}`}><p className={styles.percent}>98%</p><div className={styles.satisfactionCopy}><h2 id="satisfaction-title" className={styles.satisfactionTitle}>Contractor satisfaction</h2><p className={styles.satisfactionBody}>Our contractors drive our success—and it shows.</p></div></div></section>

        <section className={`${styles.section} ${styles.white}`} aria-labelledby="opportunity-title"><div className={styles.inner}><div className={styles.headingCenter}><p className={styles.sectionEyebrow}>A real path forward</p><h2 id="opportunity-title" className={styles.sectionTitle}>From values to opportunity.</h2></div><div className={styles.opportunityGrid}>{opportunities.map(([title, body, Icon]) => <article className={styles.opportunity} key={title}><Icon className={styles.opportunityIcon} aria-hidden="true" focusable="false" strokeWidth={1.5} /><h3 className={styles.opportunityTitle}>{title}</h3><p className={styles.opportunityBody}>{body}</p></article>)}</div></div></section>

        <ClosingCta eyebrow="" title="Ready to join our culture?" body="Build relationships. Help customers. Grow your career." primaryLabel="Join our team" primaryHref="/apply" />
      </div>
    </PageWrapper>
  );
}
