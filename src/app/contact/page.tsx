"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  ArrowRight,
  Check,
  Clock3,
  Link2,
  Mail,
  Phone,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import { ClosingCta, PublicContainer, PublicSection } from "@/components/public";
import styles from "./contact-page.module.css";

const inputClassName =
  "mt-2 min-h-12 w-full border border-[#b9c7d7] bg-white px-4 py-3 text-base text-[#102649] outline-none transition-shadow placeholder:text-[#7b899d] focus-visible:ring-2 focus-visible:ring-[#8dc63f] focus-visible:ring-offset-2 lg:min-h-14";

export default function ContactPage() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      // Simulated submit behavior is intentionally preserved until a backend is connected.
      await new Promise((resolve) => setTimeout(resolve, 1000));
      console.log("Form submitted:", formData);
      setSubmitted(true);
    } catch {
      setError("Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  return (
    <PageWrapper>
      {/* The global `public-contact` hook is deliberately gone: public.css keys ~240
          lines of retired 1px-comp pixel locks off it (hero 647px, h1 128px, 3.2rem
          link titles, the 258px closing band). The route styles itself now. */}
      <div className={styles.route}>
      <section className="contact-hero public-topo-surface text-white">
        <PublicContainer>
          <div className="contact-hero-grid grid items-center gap-10 py-14 md:grid-cols-[0.92fr_1.08fr] md:py-[72px]">
            <div className="contact-hero-copy max-w-xl">
              <p className="public-eyebrow contact-eyebrow text-[#8dc63f]">Get in touch</p>
              <h1 className="contact-hero-title uppercase tracking-[-0.01em]">
                LET’S START <span className="block text-[#8dc63f]">THE RIGHT CONVERSATION.</span>
              </h1>
              <p className="contact-hero-body mt-6 text-white/85">
                Questions about joining 3C, building a contractor team, or the services we represent? Choose a path and we&apos;ll point you in the right direction.
              </p>
            </div>
            <div aria-hidden="true" className="contact-hero-art">
              <Image
                src="/redesign/contact-three-c-hd-x4f.png"
                alt=""
                width={1860}
                height={1520}
                priority
                sizes="(max-width: 767px) 90vw, 46vw"
              />
            </div>
          </div>
        </PublicContainer>
      </section>

      <section className="relative bg-white">
        <div className="contact-fast-path relative z-0 grid md:grid-cols-[1.35fr_0.65fr]">
          <span aria-hidden="true" className="contact-fast-path-pale" />
          <div className="contact-fast-path-navy public-topo-surface px-5 py-14 text-white sm:px-10 md:px-12 md:py-[72px] lg:px-[max(3rem,calc((100vw-1240px)/2))] lg:pr-16">
            <p className="public-eyebrow contact-eyebrow text-[#8dc63f]">Choose a path</p>
            <h2 className="contact-split-title uppercase tracking-[-0.01em]">The fastest path</h2>
            <div className="contact-fast-path-rows mt-7 grid gap-0">
              <Link href="/apply" className="group flex min-h-[72px] items-center gap-4 border-b border-white/20 py-3 text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f]">
                <PathwayPersonIcon className="h-9 w-9 shrink-0 text-[#8dc63f] md:h-10 md:w-10" />
                <span className="contact-fast-path-link-title uppercase tracking-[-0.01em]">Join as a sales rep</span>
                <ArrowRight aria-hidden="true" className="ml-auto h-6 w-6 shrink-0 text-[#8dc63f] transition-transform group-hover:translate-x-1" />
              </Link>
              <Link href="/opportunities" className="group flex min-h-[72px] items-center gap-4 py-3 text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f]">
                <PathwayTeamIcon className="h-9 w-9 shrink-0 text-[#8dc63f] md:h-10 md:w-10" />
                <span className="contact-fast-path-link-title uppercase tracking-[-0.01em]">Bring or build a team</span>
                <ArrowRight aria-hidden="true" className="ml-auto h-6 w-6 shrink-0 text-[#8dc63f] transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
          <div className="contact-general-panel relative z-[1] px-5 py-14 sm:px-10 md:px-12 md:py-[72px] lg:px-16">
            <p className="public-eyebrow contact-eyebrow text-[#5f8f1f]">Anything else</p>
            <h2 className="contact-split-title contact-split-title-dark uppercase tracking-[-0.01em]">General questions</h2>
            <Link href="/services" className="group mt-7 flex min-h-[72px] items-center gap-4 text-[#102649] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f]">
              <PathwayChatIcon className="h-10 w-10 shrink-0 text-[#102649]" />
              <span className="contact-fast-path-link-title uppercase tracking-[-0.01em]">Services &amp; support</span>
              <ArrowRight aria-hidden="true" className="ml-auto h-6 w-6 shrink-0 text-[#102649] transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      <PublicSection tone="white" className="contact-form-section">
        <PublicContainer>
          <div className="contact-form-grid grid gap-8 lg:mx-4 lg:grid-cols-[1.5fr_1fr] lg:gap-6">
            <div className="border border-[#cbd6e2] bg-white p-5 sm:p-8 lg:p-14">
                <div className="public-section-heading public-section-heading-left"><h2 className="contact-form-heading public-section-title !max-w-none">Send us a message</h2></div>
                {submitted ? (
                  <div className="border border-[#8dc63f] bg-[#f7f9fc] p-7" aria-live="polite">
                    <div className="flex h-12 w-12 items-center justify-center bg-[#8dc63f] text-[#102649]">
                      <Check aria-hidden="true" className="h-7 w-7" strokeWidth={3} />
                    </div>
                    <h3 className="contact-success-title mt-5 text-3xl uppercase tracking-[-0.01em] text-[#102649]">Message sent!</h3>
                    <p className="mt-2 leading-7 text-[#60728d]">Thank you for reaching out. We&apos;ll get back to you within 24-48 hours.</p>
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-8 grid gap-6 lg:gap-8">
                    <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
                      <label className="block text-sm font-bold text-[#102649] lg:text-xl" htmlFor="contact-name">
                        Full Name *
                        <input className={`${inputClassName} text-lg lg:min-h-[4.5rem] lg:px-5 lg:py-5`} type="text" id="contact-name" name="name" required value={formData.name} onChange={handleChange} placeholder="John Doe" />
                      </label>
                      <label className="block text-sm font-bold text-[#102649] lg:text-xl" htmlFor="contact-email">
                        Email Address *
                        <input className={`${inputClassName} text-lg lg:min-h-[4.5rem] lg:px-5 lg:py-5`} type="email" id="contact-email" name="email" required value={formData.email} onChange={handleChange} placeholder="john@example.com" />
                      </label>
                    </div>
                    <div className="grid gap-6 sm:grid-cols-2 lg:gap-8">
                      <label className="block text-sm font-bold text-[#102649] lg:text-xl" htmlFor="contact-phone">
                        Phone Number
                        <input className={`${inputClassName} text-lg lg:min-h-[4.5rem] lg:px-5 lg:py-5`} type="tel" id="contact-phone" name="phone" value={formData.phone} onChange={handleChange} placeholder="(555) 123-4567" />
                      </label>
                      <label className="block text-sm font-bold text-[#102649] lg:text-xl" htmlFor="contact-subject">
                        Subject *
                        <select className={`${inputClassName} text-lg lg:min-h-[4.5rem] lg:px-5 lg:py-5`} id="contact-subject" name="subject" required value={formData.subject} onChange={handleChange}>
                          <option value="">Select a subject</option>
                          <option value="services">Service Inquiry</option>
                          <option value="careers">Career Opportunity</option>
                          <option value="support">Customer Support</option>
                          <option value="partnership">Partnership Inquiry</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                    </div>
                    <label className="block text-sm font-bold text-[#102649] lg:text-xl" htmlFor="contact-message">
                      Message *
                      <textarea className={`${inputClassName} min-h-48 resize-y text-lg lg:min-h-[220px] lg:px-5 lg:py-5`} id="contact-message" name="message" required rows={5} value={formData.message} onChange={handleChange} placeholder="How can we help you?" />
                    </label>
                    {error ? <p className="border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{error}</p> : null}
                    <button type="submit" disabled={submitting} className="contact-form-submit public-button public-button-lime mt-1 w-full text-lg sm:w-fit lg:min-h-20 lg:px-10 disabled:cursor-not-allowed disabled:opacity-60">
                      <span className="contact-form-submit-label">{submitting ? "Sending..." : "Send message"}</span>
                      {!submitting ? <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /> : null}
                    </button>
                  </form>
                )}
            </div>

            <div className="border border-[#cbd6e2] bg-white p-5 sm:p-8 lg:p-14">
                <div className="public-section-heading public-section-heading-left"><h2 className="contact-form-heading public-section-title !max-w-none">Get in touch</h2></div>
                <div className="mt-7 divide-y divide-[#d7e0ea] lg:mt-10">
                  <ContactDetail icon={<Mail aria-hidden="true" />} title="Email">
                    <a className="inline-flex min-h-11 items-center hover:text-[#6d9f2d] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]" href="mailto:info@3cworldgroup.com">info@3cworldgroup.com</a>
                    <a className="flex min-h-11 items-center hover:text-[#6d9f2d] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]" href="mailto:careers@3cworldgroup.com">careers@3cworldgroup.com</a>
                  </ContactDetail>
                  <ContactDetail icon={<Phone aria-hidden="true" />} title="Phone">Coming Soon</ContactDetail>
                  <ContactDetail icon={<Clock3 aria-hidden="true" />} title="Business Hours">
                    Monday - Friday: 9am - 6pm EST<br />Saturday: 10am - 4pm EST
                  </ContactDetail>
                  <ContactDetail icon={<Link2 aria-hidden="true" />} title="Quick Links">
                    <Link className="flex min-h-11 items-center gap-1 text-[#6d9f2d] hover:text-[#102649] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]" href="/opportunities">View Career Opportunities <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    <Link className="flex min-h-11 items-center gap-1 text-[#6d9f2d] hover:text-[#102649] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]" href="/services">Explore Our Services <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                    <Link className="flex min-h-11 items-center gap-1 text-[#6d9f2d] hover:text-[#102649] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#8dc63f]" href="/apply">Apply Now <ArrowRight aria-hidden="true" className="h-4 w-4" /></Link>
                  </ContactDetail>
                </div>
            </div>
          </div>
        </PublicContainer>
      </PublicSection>

      <ClosingCta
        eyebrow="Your next move"
        title="Don’t need to wait? Apply today."
        body=""
        primaryLabel="Start your application"
        primaryHref="/apply"
        secondaryLabel=""
      />
      </div>
    </PageWrapper>
  );
}

function ContactDetail({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-4 py-5 first:pt-0 last:pb-0 lg:gap-6 lg:py-9">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center bg-[#102649] text-white lg:h-20 lg:w-20 [&>svg]:h-5 [&>svg]:w-5 lg:[&>svg]:h-9 lg:[&>svg]:w-9" aria-hidden="true">{icon}</div>
      <div className="min-w-0 text-sm leading-6 text-[#60728d] lg:text-lg lg:leading-8">
        <h3 className="font-bold text-[#102649] lg:text-xl">{title}</h3>
        <div>{children}</div>
      </div>
    </div>
  );
}

function PathwayPersonIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 64 64">
      <circle cx="32" cy="17" r="10" stroke="currentColor" strokeWidth="2" />
      <path d="M12 52c0-11 8.8-20 20-20s20 9 20 20v3H12v-3Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  );
}

function PathwayTeamIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 64 64">
      <circle cx="32" cy="18" r="9" stroke="currentColor" strokeWidth="2" />
      <circle cx="13" cy="24" r="7" stroke="currentColor" strokeWidth="2" />
      <circle cx="51" cy="24" r="7" stroke="currentColor" strokeWidth="2" />
      <path d="M17 54c0-10 6.7-18 15-18s15 8 15 18v2H17v-2Z" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
      <path d="M1 53c0-8 5.1-14 12-14 3.2 0 6 1.2 8.1 3.3M63 53c0-8-5.1-14-12-14-3.2 0-6 1.2-8.1 3.3" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}

function PathwayChatIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} fill="none" viewBox="0 0 80 80">
      <path d="M8 12h42c4.4 0 8 3.6 8 8v24c0 4.4-3.6 8-8 8H31L19 64V52H8c-4.4 0-8-3.6-8-8V20c0-4.4 3.6-8 8-8Z" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <path d="M35 28h37c4.4 0 8 3.6 8 8v20c0 4.4-3.6 8-8 8h-8v10L52 64H35c-4.4 0-8-3.6-8-8" stroke="currentColor" strokeLinejoin="round" strokeWidth="2" />
      <circle cx="18" cy="32" r="2" fill="currentColor" />
      <circle cx="29" cy="32" r="2" fill="currentColor" />
      <circle cx="40" cy="32" r="2" fill="currentColor" />
    </svg>
  );
}
