"use client";

import { useState } from "react";
import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";
import ScrollReveal from "@/components/ScrollReveal";

const faqs = [
  {
    question: "How much can I realistically earn?",
    answer: "Most active contractors earn $1,000–$3,000 per week. Top performers consistently make $4,000–$5,000+ weekly. Your earnings depend on effort — the more doors you knock, the more you earn.",
  },
  {
    question: "Do I need sales experience?",
    answer: "No experience required. We provide comprehensive training on our products, sales techniques, and territory management. Many of our top earners started with zero sales background.",
  },
  {
    question: "Is this commission-only?",
    answer: "Yes, this is a 1099 independent contractor position. You're paid per sale with no cap on earnings. This structure rewards hard work and allows top performers to out-earn traditional salaried positions.",
  },
  {
    question: "What are the hours like?",
    answer: "You set your own schedule. Most contractors work 4-8 hours per day during peak hours (typically afternoons and early evenings when people are home). Work more, earn more.",
  },
  {
    question: "What products will I be selling?",
    answer: "Fiber internet, TV packages, and home security systems from leading providers. These are services people actually want — you're helping them upgrade, not pushing unwanted products.",
  },
  {
    question: "What areas are you hiring in?",
    answer: "We're actively expanding in 20+ markets including Chicago, Dallas, Atlanta, Phoenix, Denver, Philadelphia, and more. If you don't see your city, apply anyway — we're always growing.",
  },
];

export default function ApplyPage() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Build URL with query parameters (more reliable for Google Apps Script)
      const scriptUrl = "https://script.google.com/macros/s/AKfycbxTKksrsLnqFAju_KAs8DstGE5V5CnuljsD456aVT5hlxGXMZGm50M1IXEPTi8lUR9K7A/exec";
      const params = new URLSearchParams({
        name: formData.name,
        phone: formData.phone,
        email: formData.email,
        city: formData.city,
      });

      await fetch(`${scriptUrl}?${params.toString()}`, {
        method: "GET",
        mode: "no-cors",
      });

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <section className="bg-[#0A1F44] text-white py-20 md:py-28 min-h-[60vh] flex items-center relative overflow-hidden">
          {/* Celebration Background */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-20 w-32 h-32 border-4 border-[#8dc63f] rotate-12"></div>
            <div className="absolute bottom-20 right-20 w-48 h-48 border-4 border-[#6A8FE3] -rotate-6"></div>
            <div className="absolute top-1/3 right-1/4 w-24 h-24 border-4 border-[#8dc63f] rotate-45"></div>
          </div>

          <div className="max-w-2xl mx-auto px-6 text-center relative">
            <div className="w-20 h-20 bg-[#8dc63f] flex items-center justify-center mb-8 mx-auto shadow-sharp">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
              You're In!
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6">
              Application received.
            </h1>
            <p className="text-xl text-white/70 mb-10 max-w-md mx-auto leading-relaxed">
              We'll call you within <span className="text-[#8dc63f] font-bold">2-3 business days</span> to schedule your quick intro call.
            </p>

            <div className="bg-white/10 backdrop-blur-sm p-6 mb-10 max-w-md mx-auto border-l-4 border-[#8dc63f]">
              <h3 className="font-bold mb-2">While you wait:</h3>
              <p className="text-white/70 text-sm">Check your phone — our team calls from local numbers. Save our number so you don't miss it!</p>
            </div>

            <Link
              href="/"
              className="inline-flex items-center gap-2 bg-white text-[#0A1F44] px-8 py-4 font-bold hover:bg-gray-100 transition-colors shadow-sharp hover:shadow-sharp-lg hover:-translate-y-1 transition-all"
            >
              Back to Home
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </section>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Hero - Dark Blue with Stats */}
      <section className="bg-[#0A1F44] text-white py-20 md:py-28 relative overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute top-10 left-10 w-40 h-40 border-4 border-white rotate-12"></div>
          <div className="absolute bottom-10 right-10 w-60 h-60 border-4 border-white -rotate-6"></div>
          <div className="absolute top-1/2 left-1/3 w-32 h-32 border-4 border-white rotate-45"></div>
        </div>

        <div className="max-w-6xl mx-auto px-6 relative">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Now Hiring in 20+ Markets
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-black mb-6">
                Start earning<br />
                <span className="text-[#8dc63f]">$3,000+/week</span>
              </h1>
              <p className="text-xl text-white/70 max-w-md mb-8">
                Join 500+ independent contractors making real money in door-to-door sales. No experience needed.
              </p>
              <div className="flex flex-wrap gap-6 text-sm">
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#8dc63f]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>30-second application</span>
                </div>
                <div className="flex items-center gap-2">
                  <svg className="w-5 h-5 text-[#8dc63f]" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  <span>Response in 2-3 days</span>
                </div>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="hidden lg:grid grid-cols-2 gap-4">
              <div className="bg-white/10 backdrop-blur-sm p-6 border-l-4 border-[#8dc63f]">
                <div className="text-4xl font-black text-[#8dc63f] mb-2">$2,847</div>
                <div className="text-white/70 text-sm">Avg. weekly earnings</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 border-l-4 border-[#6A8FE3]">
                <div className="text-4xl font-black text-[#6A8FE3] mb-2">500+</div>
                <div className="text-white/70 text-sm">Active contractors</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 border-l-4 border-[#8dc63f]">
                <div className="text-4xl font-black text-[#8dc63f] mb-2">20+</div>
                <div className="text-white/70 text-sm">Markets nationwide</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 border-l-4 border-[#6A8FE3]">
                <div className="text-4xl font-black text-[#6A8FE3] mb-2">92%</div>
                <div className="text-white/70 text-sm">Satisfaction rate</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Quick Benefits Banner */}
      <section className="bg-[#8dc63f] py-6">
        <div className="max-w-6xl mx-auto px-6">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 text-white text-center">
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Uncapped Earnings</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-bold">Flexible Hours</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              <span className="font-bold">Full Training</span>
            </div>
            <div className="flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span className="font-bold">Start This Week</span>
            </div>
          </div>
        </div>
      </section>

      {/* Form Section - Enhanced */}
      <section className="bg-gray-50 py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid lg:grid-cols-5 gap-12 items-start">
            {/* Form Card */}
            <ScrollReveal direction="left" className="lg:col-span-3">
              <div className="bg-white p-8 md:p-10 shadow-sharp border-t-4 border-[#8dc63f]">
                <h2 className="text-2xl md:text-3xl font-black text-[#0A1F44] mb-2">
                  Apply in 30 Seconds
                </h2>
                <p className="text-gray-600 mb-8">No resume needed. Just tell us about yourself.</p>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="name" className="block text-sm font-bold text-[#0A1F44] mb-2">
                        Full name *
                      </label>
                      <input
                        type="text"
                        id="name"
                        name="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        className="w-full px-4 py-4 border-2 border-gray-200 focus:border-[#0A1F44] outline-none transition-colors"
                        placeholder="John Smith"
                      />
                    </div>
                    <div>
                      <label htmlFor="phone" className="block text-sm font-bold text-[#0A1F44] mb-2">
                        Phone *
                      </label>
                      <input
                        type="tel"
                        id="phone"
                        name="phone"
                        required
                        value={formData.phone}
                        onChange={handleChange}
                        className="w-full px-4 py-4 border-2 border-gray-200 focus:border-[#0A1F44] outline-none transition-colors"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div className="grid md:grid-cols-2 gap-5">
                    <div>
                      <label htmlFor="email" className="block text-sm font-bold text-[#0A1F44] mb-2">
                        Email *
                      </label>
                      <input
                        type="email"
                        id="email"
                        name="email"
                        required
                        value={formData.email}
                        onChange={handleChange}
                        className="w-full px-4 py-4 border-2 border-gray-200 focus:border-[#0A1F44] outline-none transition-colors"
                        placeholder="john@example.com"
                      />
                    </div>
                    <div>
                      <label htmlFor="city" className="block text-sm font-bold text-[#0A1F44] mb-2">
                        City *
                      </label>
                      <input
                        type="text"
                        id="city"
                        name="city"
                        required
                        value={formData.city}
                        onChange={handleChange}
                        className="w-full px-4 py-4 border-2 border-gray-200 focus:border-[#0A1F44] outline-none transition-colors"
                        placeholder="Dallas, TX"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-[#8dc63f] text-white px-6 py-5 font-bold text-lg hover:bg-[#7ab82e] transition-colors disabled:opacity-70 shadow-sharp-sm hover:shadow-sharp hover:-translate-y-1 transition-all uppercase tracking-wide"
                  >
                    {isSubmitting ? "Submitting..." : "Submit My Application →"}
                  </button>

                  <p className="text-center text-sm text-gray-500">
                    By applying, you agree to be contacted about opportunities.
                  </p>
                </form>
              </div>
            </ScrollReveal>

            {/* Sidebar */}
            <ScrollReveal direction="right" delay={200} className="lg:col-span-2 space-y-6">
              {/* Testimonial Card */}
              <div className="bg-[#0A1F44] text-white p-8 shadow-sharp">
                <svg className="w-10 h-10 text-[#8dc63f] mb-4" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z" />
                </svg>
                <p className="text-lg mb-6 leading-relaxed">
                  "I went from working retail making $15/hour to averaging <span className="text-[#8dc63f] font-bold">$3,200/week</span>. Best decision I ever made."
                </p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center font-bold text-white">
                    MR
                  </div>
                  <div>
                    <div className="font-bold">Marcus R.</div>
                    <div className="text-white/60 text-sm">Dallas, TX • 8 months</div>
                  </div>
                </div>
              </div>

              {/* What Happens Next */}
              <div className="bg-white p-8 shadow-sharp-sm border-l-4 border-[#6A8FE3]">
                <h3 className="text-lg font-black text-[#0A1F44] mb-6 uppercase tracking-wide">
                  What Happens Next
                </h3>
                <div className="space-y-5">
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-[#8dc63f] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                      1
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0A1F44]">We review your application</h4>
                      <p className="text-gray-600 text-sm">Within 24-48 hours</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-[#8dc63f] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                      2
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0A1F44]">15-minute phone call</h4>
                      <p className="text-gray-600 text-sm">Quick chat to learn about you</p>
                    </div>
                  </div>
                  <div className="flex gap-4">
                    <div className="w-8 h-8 bg-[#8dc63f] text-white flex items-center justify-center font-bold text-sm flex-shrink-0">
                      3
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0A1F44]">Training & first day</h4>
                      <p className="text-gray-600 text-sm">Start earning immediately</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Trust Badges */}
              <div className="flex gap-4 text-center">
                <div className="flex-1 bg-white p-4 shadow-sharp-sm">
                  <div className="text-2xl font-black text-[#0A1F44]">4.8★</div>
                  <div className="text-xs text-gray-600">Indeed Rating</div>
                </div>
                <div className="flex-1 bg-white p-4 shadow-sharp-sm">
                  <div className="text-2xl font-black text-[#0A1F44]">Fast</div>
                  <div className="text-xs text-gray-600">Onboarding</div>
                </div>
                <div className="flex-1 bg-white p-4 shadow-sharp-sm">
                  <div className="text-2xl font-black text-[#0A1F44]">Weekly</div>
                  <div className="text-xs text-gray-600">Pay</div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-50 py-20 md:py-28">
        <div className="max-w-3xl mx-auto px-6">
          <ScrollReveal>
            <div className="text-center mb-12">
              <div className="inline-block bg-[#6A8FE3] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Common Questions
              </div>
              <h2 className="text-3xl md:text-4xl font-black text-[#0A1F44]">
                Got Questions? We've Got Answers.
              </h2>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="bg-white border-l-4 border-[#8dc63f] shadow-sharp-sm"
                >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full px-6 py-5 text-left flex items-center justify-between gap-4"
                >
                  <span className="font-bold text-[#0A1F44]">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-[#8dc63f] flex-shrink-0 transition-transform ${
                      openFaq === index ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === index ? "max-h-48 pb-5" : "max-h-0"
                  }`}
                >
                  <p className="px-6 text-gray-600 leading-relaxed">{faq.answer}</p>
                </div>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <div className="text-center mt-12">
            <p className="text-gray-600 mb-4">Still have questions?</p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 text-[#6A8FE3] font-bold uppercase tracking-wide hover:gap-3 transition-all"
            >
              Contact Us
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
