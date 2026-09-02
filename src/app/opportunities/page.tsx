import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CircleDollarSign,
  Clock3,
  FileText,
  GraduationCap,
  MapPin,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
  Tv,
  UsersRound,
  Wifi,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import { ClosingCta } from "@/components/public";
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

const startSteps = [
  { number: "01", title: "Apply online", body: "Complete a quick application in just a few minutes.", icon: FileText },
  { number: "02", title: "Interview", body: "We'll connect to learn more about you and the role.", icon: MessageCircle },
  { number: "03", title: "Training", body: "Get trained on our products, process, and sales system.", icon: BookOpen },
  { number: "04", title: "Start earning", body: "Hit the field with support and start earning.", icon: BarChart3 },
];

const pathSteps = [
  { title: "Apply online", body: "Submit your application in minutes. We're always looking for driven individuals.", icon: FileText },
  { title: "Interview", body: "Let's get to know you and explore how your goals align with our opportunity.", icon: UsersRound },
  { title: "Training", body: "Learn our proven sales process, products, and tools with hands-on coaching and support.", icon: GraduationCap },
  { title: "Start earning", body: "Launch in your protected territory and start building your income from day one.", icon: CircleDollarSign },
];

const earningBands = [
  { title: "Getting started", range: "$1K–$2K", body: "Build your pipeline and close your first deals." },
  { title: "Building momentum", range: "$2K–$4K", body: "Refine your process, increase consistency, and grow." },
  { title: "Top performers", range: "$5K+", body: "Advanced skills. Bigger results. Unlimited potential." },
];

const offerItems = [
  { title: "Uncapped commission", body: "No limits on what you can earn.", icon: CircleDollarSign },
  { title: "Full training program", body: "Hands-on training and ongoing coaching.", icon: GraduationCap },
  { title: "Flexible schedule", body: "Work when it works best for you.", icon: Clock3 },
  { title: "Protected territory", body: "Exclusive territory to build your business.", icon: ShieldCheck },
  { title: "Career growth", body: "Clear path for advancement and leadership.", icon: TrendingUp },
  { title: "Nationwide opportunities", body: "Markets across the U.S. are open and growing.", icon: MapPin },
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
            <p className="mt-6 max-w-[34ch] text-lg leading-7 text-white/78 lg:mt-7 lg:text-xl lg:leading-8">Choose your path. Build your market. Grow with real training and support.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row"><Link href="/apply" className="public-button public-button-lime w-fit lg:!h-[4.25rem] lg:!w-[14.5rem] lg:!px-4 lg:!text-[1.25rem]">Apply now <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /></Link><a href="#how-it-works" className="public-button w-fit border-white text-white hover:bg-white hover:text-[#0a1f44] lg:!h-[4.25rem] lg:!w-[17.5rem] lg:!border-2 lg:!border-white lg:!px-4 lg:!text-[1.25rem]">Explore the paths</a></div>
          </div>
          <div className="relative z-10 flex items-center justify-center"><Image src="/redesign/territory-map.png" alt="Illustrated nationwide opportunity map" width={800} height={500} priority className="h-auto max-h-[500px] w-full max-w-[800px] object-contain" sizes="(max-width: 1023px) 92vw, 48vw" /></div>
        </div>
      </section>

      <section className="border-b border-[#0a1f44]/15 bg-white py-10 sm:py-12 lg:py-14" aria-labelledby="glance-heading"><div className="public-container grid gap-6 lg:grid-cols-[0.25fr_0.75fr] lg:items-center lg:gap-10"><div><h2 id="glance-heading" className="public-section-title max-w-none text-[clamp(2rem,3.8vw,3.5rem)] lg:text-[3.4rem]"><span className="block">The opportunity,</span><span className="block">at a glance</span></h2></div><div className="grid grid-cols-2 gap-x-3 gap-y-0 sm:grid-cols-2 lg:grid-cols-4">{glanceItems.map(({ title, body, icon: Icon }, index) => <div key={title} className={`border-t border-[#0a1f44]/15 px-1 py-4 sm:border-l sm:px-5 sm:py-5 ${index < 2 ? "max-sm:border-t-0" : ""} lg:border-t-0 lg:first:border-l-0`}><Icon aria-hidden="true" className="text-[#6d9f2d]" size={44} strokeWidth={1.8} /><h3 className="mt-3 font-[var(--public-display-font)] text-sm font-extrabold uppercase leading-tight text-[#0a1f44] sm:mt-4 sm:text-base lg:text-[1.1rem]">{title}</h3><p className="mt-2 text-xs leading-5 text-[#60728d] sm:text-sm sm:leading-6 lg:text-base lg:leading-7">{body}</p></div>)}</div></div></section>

      <section id="how-it-works" className="bg-[#f7f9fb] py-10 sm:py-14 lg:py-16" aria-labelledby="steps-heading"><div className="public-container"><div className="mx-auto max-w-2xl text-center"><h2 id="steps-heading" className="public-section-title mx-auto max-w-none lg:text-[3.2rem]">How you get started.</h2></div><div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-6 md:mt-7 md:grid-cols-4 md:gap-5">{startSteps.map(({ number, title, body, icon: Icon }) => <div key={number} className="relative text-center md:px-3"><div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[#8dc63f] font-[var(--public-display-font)] text-sm font-extrabold text-[#0a1f44] md:h-11 md:w-11 md:text-lg">{number}</div><Icon aria-hidden="true" className="mx-auto mt-4 text-[#0a1f44] md:mt-5 md:h-16 md:w-16 lg:h-20 lg:w-20" size={38} strokeWidth={1.45} /><h3 className="mt-3 font-[var(--public-display-font)] text-sm font-extrabold uppercase text-[#0a1f44] md:mt-3 md:text-base lg:text-base">{title}</h3><p className="mx-auto mt-1 max-w-[19ch] text-xs leading-5 text-[#60728d] sm:text-sm sm:leading-6 lg:text-sm lg:leading-6">{body}</p></div>)}</div></div></section>

      <section id="contractor" className="bg-white" aria-labelledby="path-heading"><div className="grid lg:grid-cols-2"><div className="public-container py-10 sm:py-12 lg:py-16 lg:pr-16"><h2 id="path-heading" className="public-section-title max-w-none text-[clamp(2.15rem,3.4vw,3.25rem)] lg:text-[3.7rem]">Your path to success</h2><div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-5 lg:mt-8 lg:grid-cols-1 lg:divide-y lg:divide-[#0a1f44]/15">{pathSteps.map(({ title, body, icon: Icon }) => <div key={title} className="flex flex-col gap-2 py-1 lg:flex-row lg:gap-4 lg:py-5 lg:first:pt-0"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#061735] text-[#c3ed4d] lg:h-16 lg:w-16"><Icon aria-hidden="true" size={26} strokeWidth={1.8} /></span><div><h3 className="font-[var(--public-display-font)] text-sm font-extrabold uppercase text-[#0a1f44] lg:text-lg">{title}</h3><p className="mt-1 max-w-[38ch] text-xs leading-5 text-[#60728d] lg:text-base lg:leading-7">{body}</p></div></div>)}</div></div><div className="relative bg-[#061735] px-5 py-10 text-white sm:px-10 sm:py-12 lg:px-14 lg:py-16"><div className="mx-auto max-w-xl lg:ml-0"><h2 className="font-[var(--public-display-font)] text-[clamp(2.35rem,5vw,4.8rem)] font-extrabold uppercase leading-[0.88] tracking-[-0.055em] lg:text-[3.5rem]">Earning potential</h2><div className="mt-5 divide-y divide-white/25 lg:mt-8">{earningBands.map(({ title, range, body }, index) => <div key={title} className="grid gap-2 py-5 sm:grid-cols-[1fr_auto] sm:items-center lg:gap-4 lg:py-6"><div><div className="flex items-center gap-2 lg:gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-full border border-white/70 font-[var(--public-display-font)] text-xs font-extrabold lg:h-9 lg:w-9 lg:text-base">{index + 1}</span><h3 className="font-[var(--public-display-font)] text-sm font-extrabold uppercase tracking-[0.04em] lg:text-lg lg:tracking-[0.06em]">{title}</h3></div><p className="mt-2 max-w-[31ch] pl-9 text-xs leading-5 text-white/65 lg:mt-1 lg:pl-12 lg:text-sm lg:leading-6">{body}</p></div><p className="whitespace-nowrap font-[var(--public-display-font)] text-2xl font-extrabold text-[#c3ed4d] sm:text-3xl lg:text-[3.25rem]">{range}<span className="ml-1 text-[0.58em] uppercase tracking-[0.1em]">/week</span></p></div>)}</div><p className="mt-3 text-xs text-white/55 lg:text-sm">Earnings vary by performance and market.</p></div></div></div></section>

      <section className="bg-[#061735] py-10 text-white sm:py-14 lg:py-16" aria-labelledby="sell-heading"><div className="public-container"><div className="mx-auto max-w-2xl text-center"><h2 id="sell-heading" className="public-section-title mx-auto max-w-none text-[clamp(2rem,3.8vw,3.5rem)] text-white lg:text-[3.8rem]">What you&apos;ll sell</h2></div><div className="mt-8 grid grid-cols-2 gap-0 md:grid-cols-3">{[{ title: "Fiber Internet", body: "High-speed connectivity that keeps homes and businesses running at their best.", icon: Wifi }, { title: "TV Services", body: "Entertainment that brings people together with crystal-clear picture and reliable service.", icon: Tv }, { title: "Security Systems", body: "Smart, reliable protection that gives customers peace of mind 24/7.", icon: ShieldCheck }].map(({ title, body, icon: Icon }) => <div key={title} className="border-t border-white/25 px-2 py-5 md:border-l md:border-t-0 md:px-8"><Icon aria-hidden="true" size={56} strokeWidth={1.5} className="text-[#c3ed4d]" /><h3 className="mt-3 font-[var(--public-display-font)] text-base font-extrabold uppercase text-[#c3ed4d] md:text-xl lg:text-[1.8rem]">{title}</h3><p className="mt-2 max-w-[30ch] text-xs leading-5 text-white/70 md:text-sm md:leading-6 lg:text-base">{body}</p></div>)}</div></div></section>

      <section className="bg-white py-10 sm:py-14 lg:py-16" aria-labelledby="offer-heading"><div className="public-container"><div className="mx-auto max-w-2xl text-center"><h2 id="offer-heading" className="public-section-title mx-auto max-w-none text-[clamp(2rem,3.8vw,3.5rem)] lg:text-[3.4rem]">What we offer</h2></div><div className="mt-8 grid grid-cols-2 gap-x-3 gap-y-0 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">{offerItems.map(({ title, body, icon: Icon }, index) => <div key={title} className={`border-t border-[#0a1f44]/15 px-1 py-4 sm:px-4 sm:py-5 lg:border-l lg:border-t-0 lg:px-3 ${index < 2 ? "max-sm:border-t-0" : ""} lg:first:border-l-0`}><Icon aria-hidden="true" className="h-8 w-8 text-[#6d9f2d] lg:h-14 lg:w-14" size={31} strokeWidth={1.7} /><h3 className="mt-2 max-w-[16ch] font-[var(--public-display-font)] text-xs font-extrabold uppercase leading-tight text-[#0a1f44] sm:mt-4 sm:text-sm lg:text-base">{title}</h3><p className="mt-1 max-w-[28ch] text-[0.7rem] leading-4 text-[#60728d] sm:mt-2 sm:text-xs sm:leading-5 lg:text-sm lg:leading-7">{body}</p></div>)}</div></div></section>

      <div className="careers-closing-route"><ClosingCta eyebrow="Your next market" title="Starts here." body="Take the first step toward freedom, purpose, and unlimited potential." primaryLabel="Start your application" primaryHref="/apply" secondaryLabel="" secondaryHref="" /></div>
      </div>
    </PageWrapper>
  );
}
