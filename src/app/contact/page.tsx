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
  MessagesSquare,
  Phone,
  UserRound,
  UsersRound,
} from "lucide-react";
import PageWrapper from "@/components/PageWrapper";
import { PublicContainer, PublicSection } from "@/components/public";
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
      <div className={`${styles.route} public-contact`}>
      <section className="contact-hero public-topo-surface text-white">
        <PublicContainer>
          <div className="relative grid min-h-[390px] items-center gap-8 py-14 md:grid-cols-[1.05fr_0.95fr] md:py-20 lg:min-h-[650px] lg:grid-cols-[1.05fr_0.95fr]">
            <div className="relative z-10 max-w-xl lg:self-start lg:pl-10 lg:pt-16">
              <p className="public-eyebrow text-[#8dc63f] lg:hidden">Get in touch</p>
              <h1 className="mt-4 max-w-[16ch] font-[var(--public-display-font)] text-5xl font-extrabold uppercase leading-[0.84] tracking-[-0.07em] sm:text-6xl md:max-w-[18ch] md:text-7xl lg:text-[7.2rem] lg:tracking-[-0.1em] lg:[word-spacing:0.08em]">
                <span className="contact-hero-line-start">LET’S START</span><span className="contact-hero-line-conversation block text-[#8dc63f]">THE RIGHT<span className="contact-mobile-break"><br /></span>{' '}CONVERSATION.</span>
              </h1>
              <p className="contact-hero-body mt-7 max-w-[46ch] text-base leading-7 text-white/85 sm:text-lg">
                Questions about joining 3C, building a contractor team, or the services we represent? Choose a path and we&apos;ll point you in the right direction.
              </p>
            </div>
            <div aria-hidden="true" className="pointer-events-none relative mx-auto flex h-[260px] w-full max-w-[380px] items-center justify-center md:ml-auto md:h-full md:min-h-[280px] md:max-w-[640px]">
              <Image src="/redesign/three-c-map-mark-transparent-2x.png" alt="" fill priority sizes="(max-width: 767px) 100vw, (max-width: 1023px) 60vw, (max-width: 1279px) 633px, 1266px" className="object-contain object-center opacity-100 mix-blend-lighten" />
            </div>
          </div>
        </PublicContainer>
      </section>

      <section className="relative bg-white">
        <div className="contact-fast-path relative z-0 grid md:grid-cols-[1.35fr_0.65fr]">
          <div className="public-topo-surface px-5 py-10 text-white sm:px-10 md:px-12 md:py-24 lg:px-[max(3rem,calc((100vw-1240px)/2))] lg:pr-16">
            <p className="public-eyebrow text-[#8dc63f] lg:!text-[clamp(2rem,3vw,3rem)] lg:!leading-none lg:!tracking-[0.01em] lg:after:mt-4 lg:after:block lg:after:h-1 lg:after:w-10 lg:after:bg-[#8dc63f] lg:after:content-['']">The fastest path</p>
            <div className="mt-10 grid gap-0 md:mt-12">
              <Link href="/apply" className="group flex min-h-20 items-center gap-4 border-b border-white/20 py-4 text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f] md:min-h-24 md:py-4">
                <UserRound aria-hidden="true" className="h-8 w-8 shrink-0 text-[#8dc63f] md:h-11 md:w-11 lg:h-12 lg:w-12" strokeWidth={1.6} />
                <span className="contact-fast-path-link-title font-[var(--public-display-font)] text-2xl font-extrabold uppercase tracking-[-0.03em] sm:text-3xl lg:text-4xl">Join as a sales rep</span>
                <ArrowRight aria-hidden="true" className="ml-auto h-7 w-7 shrink-0 text-[#8dc63f] transition-transform group-hover:translate-x-1 md:h-9 md:w-9" />
              </Link>
              <Link href="/opportunities" className="group flex min-h-20 items-center gap-4 py-4 text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f] md:min-h-24 md:py-4">
                <UsersRound aria-hidden="true" className="h-8 w-8 shrink-0 text-[#8dc63f] md:h-11 md:w-11 lg:h-12 lg:w-12" strokeWidth={1.6} />
                <span className="contact-fast-path-link-title font-[var(--public-display-font)] text-2xl font-extrabold uppercase tracking-[-0.03em] sm:text-3xl lg:text-4xl">Bring or build a team</span>
                <ArrowRight aria-hidden="true" className="ml-auto h-7 w-7 shrink-0 text-[#8dc63f] transition-transform group-hover:translate-x-1 md:h-9 md:w-9" />
              </Link>
            </div>
          </div>
          <div className="bg-[#f7f9fc] px-5 py-10 sm:px-10 md:min-h-[500px] md:px-12 md:py-24 lg:px-16">
            <p className="public-eyebrow lg:!text-[clamp(2rem,3vw,3rem)] lg:!leading-none lg:!tracking-[0.01em] lg:!text-[#102649] lg:after:mt-4 lg:after:block lg:after:h-1 lg:after:w-10 lg:after:bg-[#8dc63f] lg:after:content-['']">General questions</p>
            <Link href="/services" className="group mt-10 flex min-h-20 items-center gap-4 text-[#102649] focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-[#8dc63f] md:mt-12 md:min-h-28">
              <MessagesSquare aria-hidden="true" className="h-10 w-10 shrink-0 text-[#102649] md:h-14 md:w-14" strokeWidth={1.6} />
              <span className="contact-general-link-title font-[var(--public-display-font)] text-2xl font-extrabold uppercase tracking-[-0.03em] sm:text-3xl lg:text-4xl">Services &amp; support</span>
              <ArrowRight aria-hidden="true" className="ml-auto h-7 w-7 shrink-0 text-[#102649] transition-transform group-hover:translate-x-1 md:h-9 md:w-9" />
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
                    <h3 className="mt-5 font-[var(--public-display-font)] text-3xl font-extrabold uppercase tracking-[-0.04em] text-[#102649]">Message sent!</h3>
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
                        <select className={`${inputClassName} appearance-none text-lg lg:min-h-[4.5rem] lg:px-5 lg:py-5`} id="contact-subject" name="subject" required value={formData.subject} onChange={handleChange}>
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
                      {submitting ? "Sending..." : "Send message"}
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

      <section className="public-closing-cta public-closing-cta-contact public-topo-surface lg:py-4" aria-labelledby="contact-closing-heading">
        <div className="public-container">
          <div className="public-closing-cta-panel">
            <div className="public-closing-cta-copy">
              <p className="public-eyebrow public-eyebrow-dark">Your next move</p>
          <h2 id="contact-closing-heading" className="public-closing-cta-title">Don&apos;t need to wait? Apply today.</h2>
              <p className="public-closing-cta-body">Take the next step toward your future with 3C World Group.</p>
            </div>
            <div className="public-closing-cta-actions">
              <Link href="/apply" className="public-button public-button-navy">Start your application <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} /></Link>
            </div>
          </div>
        </div>
      </section>
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
