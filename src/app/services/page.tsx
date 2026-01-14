import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "Our Services | 3C World Group",
  description: "High-speed fiber internet, premium TV services, and advanced security solutions - comprehensive telecommunications for homes and businesses across America.",
};

export default function ServicesPage() {
  return (
    <PageWrapper>
      {/* Hero - Dark Blue */}
      <section className="bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#5578c9] text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
              TELECOMMUNICATIONS SOLUTIONS
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Our Services
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              We partner with industry-leading providers to deliver premium fiber internet,
              TV, and security solutions for residential and commercial customers nationwide.
            </p>
          </div>
        </div>
      </section>

      {/* Services Quick Nav - White background */}
      <section className="py-8 bg-white border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-3 gap-8 text-center">
            <a href="#fiber" className="group py-4 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 bg-[#6A8FE3] rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="text-[#0A1F44] font-semibold">Fiber Internet</div>
            </a>
            <a href="#tv" className="group py-4 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <div className="text-[#0A1F44] font-semibold">TV Services</div>
            </a>
            <a href="#security" className="group py-4 hover:bg-gray-50 rounded-lg transition-colors">
              <div className="w-12 h-12 bg-[#6A8FE3] rounded-xl flex items-center justify-center mx-auto mb-2 group-hover:scale-110 transition-transform">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="text-[#0A1F44] font-semibold">Security</div>
            </a>
          </div>
        </div>
      </section>

      {/* Fiber Internet - Gray background */}
      <section id="fiber" className="py-16 md:py-24 bg-gray-50 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <div className="relative h-80">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224687301-1.jpg"
                  alt="Fiber optic internet installation"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 bg-[#6A8FE3] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                HIGH-SPEED CONNECTIVITY
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
                Fiber Internet
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed text-lg">
                Experience lightning-fast fiber optic technology. We connect homes to the future
                of internet with blazing speeds that keep up with modern demands – streaming, gaming,
                remote work, and everything in between.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Blazing Fast Speeds</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">99.9% Reliability</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">No Data Caps</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Symmetrical Upload</span>
                </div>
              </div>
              <Link href="/contact" className="inline-flex items-center gap-2 bg-[#8dc63f] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors shadow-lg">
                Check Availability
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* TV Services - White background */}
      <section id="tv" className="py-16 md:py-24 bg-white scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="order-2 md:order-1">
              <div className="inline-flex items-center gap-2 bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                PREMIUM ENTERTAINMENT
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
                Reliable TV Services
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed text-lg">
                Premium entertainment for the whole family. Access hundreds of channels including
                live sports, breaking news, blockbuster movies, and on-demand content – all in
                crystal-clear quality.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">HD & 4K Quality</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Cloud DVR</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Watch Anywhere</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Parental Controls</span>
                </div>
              </div>
              <Link href="/contact" className="inline-flex items-center gap-2 bg-[#6A8FE3] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#5578c9] transition-colors shadow-lg">
                View Packages
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
            <div className="order-1 md:order-2 rounded-2xl overflow-hidden shadow-xl">
              <div className="relative h-80">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/1448455557.jpg"
                  alt="Family watching TV at home"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Security - Gray background */}
      <section id="security" className="py-16 md:py-24 bg-gray-50 scroll-mt-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <div className="relative h-80">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224116080.jpg"
                  alt="Modern home security technology"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <div className="inline-flex items-center gap-2 bg-[#0A1F44] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                HOME & BUSINESS PROTECTION
              </div>
              <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
                Advanced Security Solutions
              </h2>
              <p className="text-gray-600 mb-6 leading-relaxed text-lg">
                Protect what matters most with comprehensive home and business security.
                24/7 professional monitoring, smart home integration, and peace of mind
                for you and your family.
              </p>
              <div className="grid grid-cols-2 gap-4 mb-8">
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">24/7 Monitoring</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Smart Home Ready</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">HD Cameras</span>
                </div>
                <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-300 shadow-sm">
                  <div className="w-10 h-10 bg-[#6A8FE3] rounded-lg flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-[#0A1F44] font-medium text-sm">Pro Installation</span>
                </div>
              </div>
              <Link href="/contact" className="inline-flex items-center gap-2 bg-[#8dc63f] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#7ab82e] transition-colors shadow-lg">
                Get Protected
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Customer Testimonials - White background */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              TESTIMONIALS
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              What Our Customers Say
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Real feedback from homeowners and businesses we've served across America.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-600 mb-6 italic">
                "3C World Group's fiber internet is the fastest I've ever used. Seamless streaming and work-from-home reliability!"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">JS</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Jane S.</div>
                  <div className="text-sm text-gray-500">Homeowner</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-600 mb-6 italic">
                "Our business upgraded to 3C's security solutions—easy setup and total peace of mind."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">MR</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Mike R.</div>
                  <div className="text-sm text-gray-500">Small Business Owner</div>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-1 mb-4">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} className="w-5 h-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                  </svg>
                ))}
              </div>
              <p className="text-gray-600 mb-6 italic">
                "As a contractor, I love the earning potential and nationwide support. Highly recommend joining the team!"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">AT</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Alicia T.</div>
                  <div className="text-sm text-gray-500">Sales Contractor</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Dark Blue */}
      <section className="py-20 bg-[#0A1F44]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            Bundle & Save
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            Combine internet, TV, and security services for the best value.
            Contact us today for a personalized quote.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/contact"
              className="inline-block bg-[#8dc63f] text-white px-10 py-5 rounded-xl font-bold text-lg hover:bg-[#7ab82e] transition-colors shadow-lg"
            >
              Get a Quote
            </Link>
            <Link
              href="/opportunities"
              className="inline-block border-2 border-white text-white px-10 py-5 rounded-xl font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Join Our Sales Team
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
