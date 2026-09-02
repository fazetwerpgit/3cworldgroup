"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  CircleDollarSign,
  Clock3,
  FilePenLine,
  GraduationCap,
  PhoneCall,
  Star,
  UserRound,
  Wifi,
  Zap,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import ScrollReveal from "@/components/ScrollReveal";
import { ClosingCta, PublicContainer } from "@/components/public";
import styles from "./apply-page.module.css";

const inputClassName =
  "mt-2 min-h-11 w-full border border-[#b9c7d7] bg-white px-4 py-3 text-base text-[#102649] outline-none transition-shadow placeholder:text-[#7b899d] focus-visible:ring-2 focus-visible:ring-[#8dc63f] focus-visible:ring-offset-2";

const applyRouteCss = `
  @media (min-width: 1023px) {
    body:has(#apply-route-root) .public-nav-row > .public-brand,
    body:has(#apply-route-root) .public-nav-row > .public-desktop-nav {
      color: var(--public-ink) !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }
    body:has(#apply-route-root) .public-nav-row > .public-brand *,
    body:has(#apply-route-root) .public-nav-row > .public-desktop-nav * {
      background: transparent !important;
      border-color: transparent !important;
      box-shadow: none !important;
      color: var(--public-ink) !important;
      opacity: 1 !important;
      text-shadow: none !important;
    }
    body:has(#apply-route-root) .public-nav-row > .public-brand img,
    body:has(#apply-route-root) .public-nav-row > .public-desktop-nav svg {
      opacity: 1 !important;
    }
    body:has(#apply-route-root) .public-nav-row > .public-desktop-nav .public-nav-apply {
      background: var(--public-lime) !important;
      border-color: var(--public-lime) !important;
      color: var(--public-navy) !important;
    }
    body:has(#apply-route-root) .public-nav-row > .public-desktop-nav .public-nav-link.is-active::after {
      background: var(--public-lime) !important;
    }

    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel,
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel * {
      opacity: 1 !important;
      text-shadow: none !important;
    }
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel .public-eyebrow {
      color: #fff !important;
    }
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel .public-closing-cta-title {
      color: var(--public-lime) !important;
      max-width: none !important;
    }
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel .public-closing-cta-body {
      color: rgba(239, 246, 255, 0.78) !important;
    }
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel .public-button {
      background: var(--public-navy) !important;
      border-color: var(--public-navy) !important;
      color: #fff !important;
    }
    body:has(#apply-route-root) .apply-closing-route .public-closing-cta-panel svg {
      color: currentColor !important;
      opacity: 1 !important;
    }

    #apply-route-root .apply-hero-grid {
      min-height: 29rem;
      grid-template-columns: minmax(0, 1fr) minmax(30rem, 0.95fr);
    }
    #apply-route-root .apply-form-panel {
      clip-path: polygon(11% 0, 100% 0, 100% 100%, 0 100%);
      min-height: 27rem;
      padding-left: clamp(4.75rem, 6vw, 7rem);
    }
    #apply-route-root .apply-hero-mark {
      max-width: none;
      opacity: 0.38;
      position: absolute;
      right: -1.5rem;
      top: 2.5rem;
      width: 22rem;
      z-index: -1;
    }
  }

  @media (min-width: 768px) and (max-width: 1199px) {
    #apply-route-root .apply-benefits-section > .public-container > div {
      grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
    }
    #apply-route-root .apply-benefits-section > .public-container > div > div {
      min-height: 9rem;
    }
    #apply-route-root .apply-benefits-section > .public-container > div > div:nth-child(odd) {
      border-left: 0;
    }
    #apply-route-root .apply-benefits-section > .public-container > div > div:nth-child(even) {
      border-left: 1px solid #d7e0ea;
    }
  }

  @media (max-width: 767px) {
    #apply-route-root .apply-process-grid {
      grid-template-columns: minmax(0, 1fr) !important;
      gap: 2rem !important;
      margin-top: 2rem;
    }
    #apply-route-root .apply-process-grid > div,
    #apply-route-root .apply-process-grid > div:last-child {
      align-items: flex-start;
      grid-column: auto !important;
      min-width: 0;
    }
    #apply-route-root .apply-process-grid > div > div:last-child {
      min-width: 0;
    }
    #apply-route-root .apply-process-grid h3 {
      overflow-wrap: anywhere;
    }
  }
`;

export default function ApplyPage() {
  return (
    <Suspense>
      <ApplyPageContent />
    </Suspense>
  );
}

function ApplyPageContent() {
  const searchParams = useSearchParams();
  const formStartedAtRef = useRef(Date.now());
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    referredBy: "",
    website: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      setFormData((prev) => ({ ...prev, referredBy: ref }));
    }
  }, [searchParams]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    if (formData.website || Date.now() - formStartedAtRef.current < 3000) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          city: formData.city,
          referredBy: formData.referredBy,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to submit application");
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("There was an error submitting your application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <PageWrapper>
        <style>{applyRouteCss}</style>
        <div id="apply-route-root" className={styles.route}>
        <section className="public-topo-surface flex min-h-[65vh] items-center overflow-hidden py-20 text-white md:py-28">
          <PublicContainer>
            <div className="mx-auto max-w-2xl text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center bg-[#8dc63f] text-[#102649]">
                <Check aria-hidden="true" className="h-9 w-9" strokeWidth={3} />
              </div>
              <p className="public-eyebrow mt-8 text-[#8dc63f]">You&apos;re in!</p>
              <h1 className="mt-4 font-[var(--public-display-font)] text-5xl font-extrabold uppercase leading-[0.94] tracking-[-0.06em] sm:text-6xl">Application received.</h1>
              <p className="mx-auto mt-6 max-w-[34ch] text-lg leading-8 text-white/80">We&apos;ll call you within <span className="font-bold text-[#8dc63f]">2-3 business days</span> to schedule your quick intro call.</p>
              <div className="mx-auto mt-9 max-w-md border-l border-[#8dc63f]/70 bg-white/10 p-6 text-left">
                <h2 className="font-bold">While you wait</h2>
                <p className="mt-2 text-sm leading-6 text-white/75">Check your phone. Our team calls from local numbers, so save our number when it comes through.</p>
              </div>
              <Link href="/" className="public-button public-button-lime mt-9">Back to home <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /></Link>
            </div>
          </PublicContainer>
        </section>
        </div>
      </PageWrapper>
    );
  }

  return (
      <PageWrapper>
        <style>{applyRouteCss}</style>
        <div id="apply-route-root" className={styles.route}>
        <section className="public-topo-surface overflow-hidden text-white">
        <PublicContainer>
          <div className="apply-hero-grid grid gap-10 py-12 md:py-16 lg:items-center lg:gap-14 lg:py-8">
            <div className="apply-hero-copy relative z-10 max-w-xl">
              <p className="public-eyebrow inline-block bg-[#8dc63f] px-4 py-2 text-white lg:flex lg:h-[43px] lg:w-[333px] lg:items-center lg:justify-center lg:px-5 lg:py-0 lg:text-center lg:!font-extrabold lg:!text-[1.15rem] lg:!text-white">Now hiring in 20+ markets</p>
              <h1 className="relative z-10 mt-4 max-w-[18ch] font-[var(--public-display-font)] text-5xl font-extrabold uppercase leading-[0.9] tracking-[-0.07em] sm:text-6xl md:text-7xl lg:max-w-[18ch] lg:text-[clamp(4.5rem,6vw,7rem)]">
                <span className="block lg:whitespace-nowrap">Start earning</span><span className="block text-[#8dc63f] lg:whitespace-nowrap">$3,000+/week</span>
              </h1>
              <p className="mt-6 max-w-[38ch] text-base leading-7 text-white/85 sm:text-lg lg:mt-2 lg:translate-y-0 lg:text-[1.35rem] lg:leading-8">Join 500+ independent contractors making real money in door-to-door sales. No experience needed.</p>
              <div className="relative mt-8 max-w-md lg:mt-6">
                <div className="grid max-w-[68%] gap-3 text-sm font-bold uppercase tracking-[0.08em] sm:max-w-md sm:grid-cols-2 lg:text-lg">
                  <div className="flex items-center gap-3"><Clock3 aria-hidden="true" className="h-6 w-6 shrink-0 text-[#8dc63f] lg:h-8 lg:w-8" /><span>30-second application</span></div>
                  <div className="flex items-center gap-3"><Check aria-hidden="true" className="h-6 w-6 shrink-0 text-[#8dc63f] lg:h-8 lg:w-8" /><span>Response in 2-3 days</span></div>
                </div>
              </div>
              <div aria-hidden="true" className="mt-8 flex justify-center sm:justify-end lg:mt-10 lg:justify-center">
                <Image
                  src="/redesign/three-c-map-mark-transparent.png"
                  alt=""
                  width={793}
                  height={496}
                  className="apply-hero-mark h-auto w-full max-w-[20rem] object-contain opacity-70"
                  sizes="(max-width: 639px) 80vw, 320px"
                />
              </div>
            </div>

            <ScrollReveal direction="right">
              <div id="apply-form" className="apply-form-panel relative z-10 scroll-mt-24 bg-[#f7f9fc] p-5 text-[#102649] shadow-[0_20px_60px_rgba(0,0,0,0.2)] sm:p-8 md:p-10 lg:px-12 lg:py-10 lg:pl-20">
                <h2 className="font-[var(--public-display-font)] text-3xl font-extrabold uppercase leading-none tracking-[-0.05em] sm:text-4xl lg:text-6xl">Apply in 30 seconds</h2>
                <p className="mt-3 text-base text-[#60728d] lg:text-lg">No resume needed. Just tell us about yourself.</p>
                <form onSubmit={handleSubmit} className="mt-7 grid gap-4 lg:mt-8 lg:gap-4">
                  <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
                    <label htmlFor="website">Website (leave blank)</label>
                    <input type="text" id="website" name="website" tabIndex={-1} autoComplete="off" value={formData.website} onChange={handleChange} />
                  </div>
                  <label className="block text-sm font-bold lg:text-lg" htmlFor="apply-name">Full Name *<input className={`${inputClassName} lg:min-h-14 lg:px-5 lg:py-4`} type="text" id="apply-name" name="name" required value={formData.name} onChange={handleChange} placeholder="Enter your full name" /></label>
                  <label className="block text-sm font-bold lg:text-lg" htmlFor="apply-phone">Phone *<input className={`${inputClassName} lg:min-h-14 lg:px-5 lg:py-4`} type="tel" id="apply-phone" name="phone" required value={formData.phone} onChange={handleChange} placeholder="(555) 123-4567" /></label>
                  <label className="block text-sm font-bold lg:text-lg" htmlFor="apply-email">Email *<input className={`${inputClassName} lg:min-h-14 lg:px-5 lg:py-4`} type="email" id="apply-email" name="email" required value={formData.email} onChange={handleChange} placeholder="you@example.com" /></label>
                  <label className="block text-sm font-bold lg:text-lg" htmlFor="apply-city">City *<input className={`${inputClassName} lg:min-h-14 lg:px-5 lg:py-4`} type="text" id="apply-city" name="city" required value={formData.city} onChange={handleChange} placeholder="Enter your city" /></label>
                  <label className="block text-sm font-bold lg:text-lg" htmlFor="apply-referred-by">Referred By (optional)<input className={`${inputClassName} lg:min-h-14 lg:px-5 lg:py-4`} type="text" id="apply-referred-by" name="referredBy" value={formData.referredBy} onChange={handleChange} placeholder="How did you hear about us?" /></label>
                  <button type="submit" disabled={isSubmitting} className="public-button public-button-lime mt-2 w-full lg:!min-h-[4rem] lg:px-8 lg:!text-[1.25rem] disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? "Submitting..." : "Submit my application"}<ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /></button>
                  <p className="text-center text-xs leading-5 text-[#7b899d] lg:!text-[1.05rem] lg:leading-6">By applying, you agree to be contacted about opportunities.</p>
                </form>
              </div>
            </ScrollReveal>
          </div>
        </PublicContainer>
      </section>

      <section className="apply-benefits-section border-b border-[#d7e0ea] bg-[#f7f9fc]">
        <PublicContainer>
          <div className="grid grid-cols-2 divide-x divide-y divide-[#d7e0ea] py-2 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4">
            <Benefit icon={<CircleDollarSign aria-hidden="true" />} title="Uncapped earnings" />
            <Benefit icon={<Clock3 aria-hidden="true" />} title="Flexible hours" />
            <Benefit icon={<GraduationCap aria-hidden="true" />} title="Full training" />
            <Benefit icon={<Zap aria-hidden="true" />} title="Start this week" />
          </div>
        </PublicContainer>
      </section>

      <section className="apply-process-section bg-white py-12 sm:py-16 lg:py-16">
        <PublicContainer>
          <h2 className="apply-process-heading text-center font-[var(--public-display-font)] text-4xl font-extrabold uppercase leading-none tracking-[-0.06em] text-[#102649] sm:text-5xl lg:text-[4rem]">What happens next</h2>
          <div className="apply-process-grid mt-7 grid grid-cols-2 gap-x-4 gap-y-6 md:mt-8 md:grid-cols-3 md:divide-x md:divide-[#d7e0ea] lg:mt-11 lg:px-14">
            <NextStep icon={<FilePenLine aria-hidden="true" />} number="1" title="We review your application" body="Within 24-48 hours" />
            <NextStep icon={<PhoneCall aria-hidden="true" />} number="2" title="15-minute phone call" body="Quick chat to learn about you" />
            <NextStep icon={<BarChart3 aria-hidden="true" />} number="3" title="Training & first day" body="Start earning immediately" />
          </div>
        </PublicContainer>
      </section>

      <section className="apply-route-metrics public-topo-surface py-10 text-white sm:py-14 lg:py-16">
        <PublicContainer>
          <div className="grid grid-cols-2 gap-x-5 gap-y-7 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-white/25">
            <Metric value="$2,847" label="Avg. weekly earnings" accent="lime" />
            <Metric value="500+" label="Active contractors" accent="blue" />
            <Metric value="20+" label="Markets nationwide" accent="lime" />
            <Metric value="92%" label="Satisfaction rate" accent="blue" />
          </div>
        </PublicContainer>
      </section>

      <section className="bg-white py-12 sm:py-16 lg:py-10">
        <PublicContainer>
          <h2 className="text-center font-[var(--public-display-font)] text-4xl font-extrabold uppercase leading-none tracking-[-0.06em] text-[#102649] sm:text-5xl lg:text-[3.75rem]">Good to know before you apply</h2>
          <div className="mt-8 grid grid-cols-2 gap-x-4 gap-y-8 sm:mt-10 sm:grid-cols-2 lg:grid-cols-4 lg:divide-x lg:divide-[#d7e0ea]">
            <GoodToKnow icon={<UserRound aria-hidden="true" />} title="1099 independent contractor" body="You&apos;ll work as a 1099 independent contractor." />
            <GoodToKnow icon={<CircleDollarSign aria-hidden="true" />} title="Commission-only with uncapped earnings" body="Your effort drives your earnings. Top performers earn more." />
            <GoodToKnow icon={<Star aria-hidden="true" />} title="No sales experience required" body="We provide full training and ongoing support." />
            <GoodToKnow icon={<Wifi aria-hidden="true" />} title="Products you&apos;ll represent" body="Fiber internet, TV services, and security systems." />
          </div>
        </PublicContainer>
      </section>

      <div className="apply-closing-route lg:[&_.public-closing-cta_.public-eyebrow]:!text-[1.35rem] lg:[&_.public-closing-cta_.public-eyebrow]:!text-white lg:[&_.public-closing-cta-title]:!max-w-none lg:[&_.public-closing-cta-title]:!text-[4.2rem] lg:[&_.public-closing-cta-title]:!text-[#c3ed4d]"><ClosingCta eyebrow="Your next market" title="Starts here." body="" primaryLabel="Submit your application" primaryHref="#apply-form" secondaryLabel="" secondaryHref="" /></div>
        </div>
    </PageWrapper>
  );
}

function Benefit({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex min-w-0 min-h-28 items-center gap-4 px-4 py-5 sm:flex-col sm:justify-center sm:gap-3 sm:text-center lg:min-h-48">
      <div className="shrink-0 text-[#8dc63f] [&>svg]:h-9 [&>svg]:w-9 lg:[&>svg]:h-16 lg:[&>svg]:w-16" aria-hidden="true">{icon}</div>
      <span className={`${styles.benefitLabel} min-w-0 font-[var(--public-display-font)] text-lg font-extrabold uppercase tracking-[-0.02em] text-[#102649] lg:text-[1.8rem]`}>{title}</span>
    </div>
  );
}

function NextStep({ icon, number, title, body }: { icon: React.ReactNode; number: string; title: string; body: string }) {
  return (
    <div className="flex min-w-0 gap-4 px-0 last:col-span-2 md:flex-col md:items-center md:px-8 md:text-center md:last:col-span-1">
        <div className="flex min-w-0 items-center gap-3 md:flex-row lg:gap-14">
        <span className="font-[var(--public-display-font)] text-4xl font-extrabold text-[#8dc63f] lg:text-7xl">{number}</span>
        <div className="text-[#102649] [&>svg]:h-10 [&>svg]:w-10 lg:[&>svg]:h-24 lg:[&>svg]:w-24" aria-hidden="true">{icon}</div>
      </div>
      <div className="min-w-0">
        <h3 className="break-words font-[var(--public-display-font)] text-xl font-extrabold uppercase leading-tight tracking-[-0.03em] text-[#102649] lg:text-[1.9rem]">{title}</h3>
        <p className="mt-2 text-sm leading-6 text-[#60728d] lg:text-[1.15rem] lg:leading-7">{body}</p>
      </div>
    </div>
  );
}

function Metric({ value, label, accent }: { value: string; label: string; accent: "lime" | "blue" }) {
  return (
    <div className="px-0 lg:px-8 lg:first:pl-0 lg:last:pr-0">
      <p className={`font-[var(--public-display-font)] text-4xl font-extrabold tracking-[-0.05em] lg:text-6xl ${accent === "lime" ? "text-[#8dc63f]" : "text-[#8aa9e8]"}`}>{value}</p>
      <p className="mt-1 text-sm font-bold uppercase tracking-[0.08em] text-white/80 lg:text-base">{label}</p>
    </div>
  );
}

function GoodToKnow({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="px-0 sm:px-5 lg:px-8 lg:first:pl-0 lg:last:pr-0">
      <div className="text-center text-[#8dc63f] [&>svg]:mx-auto [&>svg]:h-9 [&>svg]:w-9 lg:[&>svg]:h-16 lg:[&>svg]:w-16" aria-hidden="true">{icon}</div>
      <h3 className="mt-4 text-center font-[var(--public-display-font)] text-base font-extrabold uppercase leading-tight tracking-[-0.02em] text-[#102649] lg:text-[1.5rem]">{title}</h3>
      <p className="mt-2 text-center text-sm leading-6 text-[#60728d] lg:text-lg lg:leading-7">{body}</p>
    </div>
  );
}
