import Link from "next/link";
import {
  ArrowRight,
  CircleDollarSign,
  Clock3,
  GraduationCap,
  Monitor,
  ShieldCheck,
  UsersRound,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import USMap from "@/components/art/USMap";
import styles from "./opportunities-page.module.css";

export const metadata = {
  title: "Career Path | 3C World Group",
  description: "Build a career with 3C World Group through training, support, and a clear path forward.",
};

const glanceItems = [
  { title: "Uncapped commission", body: "Your effort drives your earnings. Top performers earn more.", icon: CircleDollarSign },
  { title: "Full training", body: "We equip you with proven systems and ongoing support.", icon: GraduationCap },
  { title: "Flexible schedule", body: "Set your own hours and build a schedule that works for you.", icon: Clock3 },
  { title: "Protected territory", body: "Exclusive markets so you can build long-term success.", icon: ShieldCheck },
];

const pathSteps = [
  { title: "Apply online", body: "Submit your application in minutes. We're always looking for driven individuals.", icon: Monitor },
  { title: "Interview", body: "Let's get to know you and explore how your goals align with our opportunity.", icon: UsersRound },
  { title: "Training", body: "Learn our proven sales process, products, and tools with hands-on coaching and support.", icon: GraduationCap },
  { title: "Start earning", body: "Launch in your protected territory and start building your income from day one.", icon: CircleDollarSign },
];

const earningBands = [
  { title: "Getting started", range: "$1K–$2K", body: "Build your pipeline and close your first deals." },
  { title: "Building momentum", range: "$2K–$4K", body: "Refine your process, increase consistency, and grow." },
  { title: "Top performers", range: "$5K+", body: "Advanced skills. Bigger results. Unlimited potential." },
];

const endingStats = [
  { figure: "$1K+", label: "First weeks" },
  { figure: "$5K+", label: "Top performers" },
  { figure: "48h", label: "Callback" },
];


export default function OpportunitiesPage() {
  return (
    <PageWrapper>
      <div id="opportunities-route" className={styles.route}>
      <section className="relative bg-[#061735] text-white">
        <div className="public-container grid gap-6 py-10 sm:py-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-center lg:gap-6 lg:py-9">
          <div className="relative z-10 max-w-xl">
            <p className="mb-5 font-[var(--public-display-font)] text-xs font-extrabold uppercase tracking-[0.18em] text-[#8dc63f]">Now hiring nationwide</p>
            <h1 className="max-w-[10ch] font-[var(--public-display-font)] text-[clamp(3.35rem,7.8vw,6.6rem)] font-extrabold uppercase leading-[0.83] tracking-[-0.06em] lg:max-w-[12ch] lg:text-[6.2rem]">Build a Career.<span className="mt-2 block text-[#8dc63f]">Not Just a Job.</span></h1>
            <p className="mt-6 max-w-[34ch] text-lg leading-7 text-white/78 lg:mt-7 lg:text-xl lg:leading-8">Choose your path. Build your market. <span className={styles.heroCopyContinuation}>Grow with real training and support.</span></p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/apply" className="public-button public-button-lime w-fit lg:!h-[4.25rem] lg:!w-[14.5rem] lg:!px-4 lg:!text-[1.25rem]">Apply now <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /></Link><a href="#how-it-works" className="public-button w-fit border-white text-white hover:bg-white hover:text-[#0a1f44] lg:!h-[4.25rem] lg:!w-[17.5rem] lg:!border-2 lg:!border-white lg:!px-4 lg:!text-[1.25rem]">Explore the paths</a></div>
          </div>
          <div className={styles.heroMapCell}><USMap className={styles.heroMap} variant="dark" glow idPrefix="careers-hero" title="Markets across the United States, connected by the 3C World Group network" /></div>
        </div>
      </section>

      <section className={styles.why} aria-labelledby="why-title">
        <div className={styles.whyInner}>
          <div className={styles.whyHead}>
            <p className={styles.whyEyebrow}>Now hiring nationwide</p>
            <h2 id="why-title" className={styles.whyTitle}>The opportunity, <span>at a glance.</span></h2>
            <p className={styles.whyLede}>What you get from day one. No fine print and no waiting period.</p>
          </div>
          <div className={styles.whyGrid}>
            {glanceItems.map(({ title, body, icon: Icon }) => (
              <div key={title} className={styles.whyItem}>
                <Icon aria-hidden="true" className={styles.whyIcon} size={52} strokeWidth={1.4} />
                <div>
                  <h3 className={styles.whyItemTitle}>{title}</h3>
                  <p className={styles.whyItemBody}>{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how-it-works" className={styles.path} aria-labelledby="path-title">
        <div className={styles.pathSteps}>
          <div className={styles.pathStepsInner}>
            <h2 id="path-title" className={styles.pathTitle}>Your path to success</h2>
            <ol className={styles.stepList}>
              {pathSteps.map(({ title, body, icon: Icon }, index) => (
                <li key={title} className={styles.step}>
                  <span className={styles.stepIcon}><Icon aria-hidden="true" size={26} strokeWidth={1.8} /></span>
                  <div>
                    <span className={styles.stepNumber}>Step {index + 1}</span>
                    <h3 className={styles.stepTitle}>{title}</h3>
                    <p className={styles.stepBody}>{body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
        <div className={styles.pathPay}>
          <div className={styles.pathPayInner}>
            <h2 className={styles.payTitle}>Earning potential</h2>
            <ol className={styles.payList}>
              {earningBands.map(({ title, range, body }, index) => (
                <li key={title} className={styles.band}>
                  <span className={styles.bandNumber}>{index + 1}</span>
                  <div className={styles.bandCopy}>
                    <h3 className={styles.bandTitle}>{title}</h3>
                    <p className={styles.bandBody}>{body}</p>
                  </div>
                  <p className={styles.bandRange}>{range}<span>/week</span></p>
                </li>
              ))}
            </ol>
            <p className={styles.payNote}>Earnings vary by performance and market.</p>
          </div>
        </div>
      </section>

      <section className={styles.ending} aria-labelledby="ending-title">
        <div className={styles.endingInner}>
          <div className={styles.endingCopy}>
            <p className={styles.endingEyebrow}>What we offer</p>
            <h2 id="ending-title" className={styles.endingTitle}>Your next market <span>starts here.</span></h2>
            <p className={styles.endingLede}>Uncapped pay, a protected territory, real training, and a team that answers the phone.</p>
          </div>
          <div className={styles.endingCard}>
            <h3 className={styles.endingCardTitle}>Apply in 30 seconds</h3>
            <p className={styles.endingCardBody}>No resume needed. We&apos;ll call within 48 hours.</p>
            <div className={styles.endingStats}>
              {endingStats.map(({ figure, label }) => (
                <div key={label}>
                  <b>{figure}</b>
                  <span>{label}</span>
                </div>
              ))}
            </div>
            <Link href="/apply" className={styles.endingButton}>Start your application <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} /></Link>
          </div>
        </div>
      </section>


      </div>
    </PageWrapper>
  );
}
