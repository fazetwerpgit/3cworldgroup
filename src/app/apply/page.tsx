"use client";

import { useState } from "react";
import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";

export default function ApplyPage() {
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    setTimeout(() => {
      console.log("Application submitted:", formData);
      setSubmitted(true);
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1000);
  };

  if (submitted) {
    return (
      <PageWrapper>
        <section className="bg-white py-32 md:py-40">
          <div className="max-w-lg mx-auto px-6">
            <div className="w-16 h-16 bg-[#8dc63f] rounded-full flex items-center justify-center mb-8">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-4xl md:text-5xl font-bold text-[#0A1F44] mb-6">
              Application received.
            </h1>
            <p className="text-lg text-gray-600 mb-10 max-w-sm leading-relaxed">
              We'll call you within 2-3 business days.
            </p>
            <Link
              href="/"
              className="text-[#8dc63f] font-semibold hover:underline inline-flex items-center gap-2"
            >
              Back to home
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </section>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {/* Hero - Dark Blue */}
      <section className="bg-[#0A1F44] text-white py-24 md:py-32">
        <div className="max-w-5xl mx-auto px-6">
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 max-w-2xl">
            Apply now.
          </h1>
          <p className="text-xl text-white/70 max-w-md">
            Takes 30 seconds. We'll reach out within 2-3 days.
          </p>
        </div>
      </section>

      {/* Form - White */}
      <section className="bg-white py-20 md:py-28">
        <div className="max-w-5xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-20">
            <div>
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
                    Full name
                  </label>
                  <input
                    type="text"
                    id="name"
                    name="name"
                    required
                    value={formData.name}
                    onChange={handleChange}
                    className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] focus:border-transparent outline-none"
                    placeholder="John Smith"
                  />
                </div>

                <div>
                  <label htmlFor="phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Phone
                  </label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    required
                    value={formData.phone}
                    onChange={handleChange}
                    className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] focus:border-transparent outline-none"
                    placeholder="(555) 123-4567"
                  />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] focus:border-transparent outline-none"
                    placeholder="john@example.com"
                  />
                </div>

                <div>
                  <label htmlFor="city" className="block text-sm font-medium text-gray-700 mb-2">
                    City
                  </label>
                  <input
                    type="text"
                    id="city"
                    name="city"
                    required
                    value={formData.city}
                    onChange={handleChange}
                    className="w-full px-4 py-4 border border-gray-200 rounded-lg focus:ring-2 focus:ring-[#0A1F44] focus:border-transparent outline-none"
                    placeholder="Dallas, TX"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-[#8dc63f] text-white px-6 py-4 rounded-lg font-semibold text-lg hover:bg-[#7ab82e] transition-colors disabled:opacity-70 mt-4"
                >
                  {isSubmitting ? "Submitting..." : "Submit"}
                </button>
              </form>
            </div>

            <div className="hidden md:block">
              <h2 className="text-2xl font-bold text-[#0A1F44] mb-8">
                What happens next
              </h2>
              <div className="space-y-8">
                <div className="flex gap-5">
                  <div className="text-3xl font-bold text-gray-200">01</div>
                  <div>
                    <h3 className="font-semibold text-[#0A1F44] mb-1">We review</h3>
                    <p className="text-gray-600 text-sm">Within 24-48 hours.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="text-3xl font-bold text-gray-200">02</div>
                  <div>
                    <h3 className="font-semibold text-[#0A1F44] mb-1">Quick call</h3>
                    <p className="text-gray-600 text-sm">15 minutes to learn about you.</p>
                  </div>
                </div>
                <div className="flex gap-5">
                  <div className="text-3xl font-bold text-gray-200">03</div>
                  <div>
                    <h3 className="font-semibold text-[#0A1F44] mb-1">Get started</h3>
                    <p className="text-gray-600 text-sm">Training and first day in field.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
