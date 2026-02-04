import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";
import AnimatedCounter from "@/components/AnimatedCounter";
import ScrollReveal from "@/components/ScrollReveal";

export const metadata = {
  title: "About Us | 3C World Group",
  description: "3C World Group specializes in nationwide B2C sales of Fiber Internet, TV, and Security services, delivering reliable solutions for homes and businesses.",
};

export default function AboutPage() {
  return (
    <PageWrapper>
      {/* Hero - Bold Chipr-style */}
      <section className="bg-[#0A1F44] text-white py-24 md:py-32 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#6A8FE3]/20 to-transparent"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block bg-[#8dc63f] text-white px-5 py-2 font-bold text-sm uppercase tracking-wider mb-8">
                Our Story
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1]">
                We Connect America.
                <span className="block text-[#8dc63f]">One Door at a Time.</span>
              </h1>
              <p className="text-xl text-white/80 leading-relaxed max-w-xl">
                3C World Group is a nationwide face-to-face sales organization specializing in
                customer acquisition for telecommunications and security providers.
              </p>
            </div>

            <div className="hidden lg:block">
              <div className="grid grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-sm p-8 border border-white/20">
                  <div className="text-5xl font-black text-[#8dc63f] mb-2">50+</div>
                  <div className="text-white/70 uppercase tracking-wide text-sm font-bold">States Served</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-8 border border-white/20">
                  <div className="text-5xl font-black text-[#8dc63f] mb-2">1,000+</div>
                  <div className="text-white/70 uppercase tracking-wide text-sm font-bold">Contractors</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-8 border border-white/20">
                  <div className="text-5xl font-black text-[#8dc63f] mb-2">$5k+</div>
                  <div className="text-white/70 uppercase tracking-wide text-sm font-bold">Weekly Potential</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-8 border border-white/20">
                  <div className="text-5xl font-black text-[#8dc63f] mb-2">98%</div>
                  <div className="text-white/70 uppercase tracking-wide text-sm font-bold">Satisfaction</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Mission */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left">
              <div className="relative">
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
                  alt="3C World Group team"
                  width={600}
                  height={500}
                  className="object-cover shadow-sharp"
                />
                <div className="absolute -bottom-6 -right-6 bg-[#8dc63f] text-white p-6 shadow-sharp hidden md:block">
                  <div className="text-3xl font-black">10+ Years</div>
                  <div className="text-sm uppercase tracking-wide">Industry Experience</div>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200}>
              <div className="inline-block bg-[#6A8FE3]/10 text-[#6A8FE3] px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Our Mission
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                Empowering Sales Professionals Across America
              </h2>
              <p className="text-lg text-gray-600 mb-6 leading-relaxed">
                We don't just offer jobs — we build careers. Our mission is to provide ambitious
                sales professionals with the training, support, and opportunities they need to
                achieve financial independence.
              </p>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Through face-to-face customer acquisition, we connect households with essential
                services while creating <strong className="text-[#8dc63f]">$1,000–$5,000+ weekly</strong> earning
                opportunities for our nationwide network of independent contractors.
              </p>

              <div className="flex flex-wrap gap-4">
                <div className="bg-gray-50 px-6 py-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">Direct Sales</div>
                  <div className="text-sm text-gray-600">Face-to-face excellence</div>
                </div>
                <div className="bg-gray-50 px-6 py-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Full Training</div>
                  <div className="text-sm text-gray-600">No experience needed</div>
                </div>
                <div className="bg-gray-50 px-6 py-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">Protected Areas</div>
                  <div className="text-sm text-gray-600">Your territory</div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* The 3 C's - Core Values */}
      <section className="bg-[#0A1F44] py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Our Values
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
                The 3 C's That Define Us
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Our name represents the core principles that guide everything we do.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Connection */}
            <ScrollReveal delay={0}>
              <div className="bg-white shadow-sharp-lg group h-full">
              <div className="relative h-56 overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80"
                  alt="Connection"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-4 left-4 bg-[#8dc63f] text-white w-12 h-12 flex items-center justify-center font-black text-2xl">
                  C
                </div>
              </div>
              <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Connection</h3>
                  <p className="text-gray-600">
                    We connect people — customers with the services they need, and contractors
                    with opportunities that transform their lives.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* Community */}
            <ScrollReveal delay={150}>
              <div className="bg-white shadow-sharp-lg group h-full">
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
                    alt="Community"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-[#6A8FE3] text-white w-12 h-12 flex items-center justify-center font-black text-2xl">
                    C
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Community</h3>
                  <p className="text-gray-600">
                    We're more than a company — we're a family. Our contractors support each
                    other and work together to serve their local communities.
                  </p>
                </div>
              </div>
            </ScrollReveal>

            {/* Commitment */}
            <ScrollReveal delay={300}>
              <div className="bg-white shadow-sharp-lg group h-full">
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=800&q=80"
                    alt="Commitment"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-[#0A1F44] text-white w-12 h-12 flex items-center justify-center font-black text-2xl">
                    C
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Commitment</h3>
                  <p className="text-gray-600">
                    We're committed to excellence — from the quality of services we represent
                    to the training and ongoing support we provide.
                  </p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Leadership Team */}
      <section className="py-24 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#0A1F44] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Leadership
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Meet the Team
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                The people driving 3C World Group's mission to connect America.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-4 gap-8">
            <ScrollReveal delay={0}>
              <div className="bg-white p-8 shadow-sharp-sm border-t-4 border-[#8dc63f] text-center h-full">
                <div className="w-24 h-24 bg-[#0A1F44] mx-auto mb-6 flex items-center justify-center">
                  <span className="text-3xl font-black text-white">JM</span>
                </div>
                <h3 className="text-xl font-black text-[#0A1F44] mb-1">Jeremy McFarland</h3>
                <p className="text-[#8dc63f] font-bold uppercase text-sm tracking-wide">Founder & CEO</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={100}>
              <div className="bg-white p-8 shadow-sharp-sm border-t-4 border-[#6A8FE3] text-center h-full">
                <div className="w-24 h-24 bg-[#0A1F44] mx-auto mb-6 flex items-center justify-center">
                  <span className="text-3xl font-black text-white">WT</span>
                </div>
                <h3 className="text-xl font-black text-[#0A1F44] mb-1">William Teasdale</h3>
                <p className="text-[#6A8FE3] font-bold uppercase text-sm tracking-wide">Director of Sales</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={200}>
              <div className="bg-white p-8 shadow-sharp-sm border-t-4 border-[#8dc63f] text-center h-full">
                <div className="w-24 h-24 bg-[#0A1F44] mx-auto mb-6 flex items-center justify-center">
                  <span className="text-3xl font-black text-white">JM</span>
                </div>
                <h3 className="text-xl font-black text-[#0A1F44] mb-1">Jacob Myers</h3>
                <p className="text-[#8dc63f] font-bold uppercase text-sm tracking-wide">Operations</p>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="bg-white p-8 shadow-sharp-sm border-t-4 border-[#6A8FE3] text-center h-full">
                <div className="w-24 h-24 bg-[#0A1F44] mx-auto mb-6 flex items-center justify-center">
                  <span className="text-3xl font-black text-white">BC</span>
                </div>
                <h3 className="text-xl font-black text-[#0A1F44] mb-1">Braeden Crouse</h3>
                <p className="text-[#6A8FE3] font-bold uppercase text-sm tracking-wide">Onboarding</p>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* What We Offer - Split Section */}
      <section className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#6A8FE3] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                What We Do
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Two Sides of Success
              </h2>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 gap-8">
            {/* For Customers */}
            <ScrollReveal direction="left">
              <div className="bg-gray-50 p-10 border-l-4 border-[#8dc63f] h-full">
              <div className="w-16 h-16 bg-[#8dc63f] flex items-center justify-center mb-6">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
              </div>
              <h3 className="text-2xl font-black text-[#0A1F44] mb-6">For Customers</h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-[#0A1F44]">High-Speed Fiber Internet</div>
                    <div className="text-gray-600">Lightning-fast connectivity up to 1 Gbps</div>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-[#0A1F44]">Premium TV Packages</div>
                    <div className="text-gray-600">Hundreds of HD channels + streaming</div>
                  </div>
                </li>
                <li className="flex items-start gap-4">
                  <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <div className="font-bold text-[#0A1F44]">Smart Home Security</div>
                    <div className="text-gray-600">24/7 professional monitoring</div>
                  </div>
                </li>
              </ul>
              </div>
            </ScrollReveal>

            {/* For Contractors */}
            <ScrollReveal direction="right" delay={200}>
              <div className="bg-gray-50 p-10 border-l-4 border-[#6A8FE3] h-full">
                <div className="w-16 h-16 bg-[#6A8FE3] flex items-center justify-center mb-6">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-[#0A1F44] mb-6">For Contractors</h3>
                <ul className="space-y-4">
                  <li className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#6A8FE3] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Comprehensive Training</div>
                      <div className="text-gray-600">Learn sales techniques that work</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#6A8FE3] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Protected Territories</div>
                      <div className="text-gray-600">Your dedicated area to work</div>
                    </div>
                  </li>
                  <li className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#6A8FE3] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Ongoing Support</div>
                      <div className="text-gray-600">Coaching and resources for success</div>
                    </div>
                  </li>
                </ul>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Stats Banner */}
      <section className="bg-[#0A1F44] py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div>
              <AnimatedCounter end={1000} suffix="+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-2 uppercase tracking-wide text-sm font-bold">Active Contractors</p>
            </div>
            <div>
              <AnimatedCounter end={50} suffix="+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-2 uppercase tracking-wide text-sm font-bold">States Covered</p>
            </div>
            <div>
              <AnimatedCounter end={5} prefix="$" suffix="k+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-2 uppercase tracking-wide text-sm font-bold">Weekly Potential</p>
            </div>
            <div>
              <AnimatedCounter end={98} suffix="%" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-2 uppercase tracking-wide text-sm font-bold">Satisfaction Rate</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-[#8dc63f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Ready to Join the Team?
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Whether you're looking for quality services or an exciting career opportunity,
              we're here to help you succeed.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/apply"
                className="bg-white text-[#8dc63f] px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-gray-100 transition-all shadow-sharp inline-flex items-center justify-center gap-3"
              >
                Apply Now
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
              <Link
                href="/contact"
                className="border-2 border-white text-white px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-white hover:text-[#8dc63f] transition-all inline-flex items-center justify-center"
              >
                Contact Us
              </Link>
            </div>
          </ScrollReveal>
        </div>
      </section>
    </PageWrapper>
  );
}
