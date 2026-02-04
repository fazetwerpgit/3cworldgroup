import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";
import ScrollReveal from "@/components/ScrollReveal";

export const metadata = {
  title: "Our Services | 3C World Group",
  description: "High-speed fiber internet, premium TV services, and advanced security solutions - comprehensive telecommunications for homes and businesses across America.",
};

export default function ServicesPage() {
  return (
    <PageWrapper>
      {/* Hero - Bold Chipr-style */}
      <section className="bg-[#0A1F44] text-white py-24 md:py-32 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#6A8FE3]/20 to-transparent"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="max-w-3xl">
            <div className="inline-block bg-[#8dc63f] text-white px-5 py-2 font-bold text-sm uppercase tracking-wider mb-8">
              Our Solutions
            </div>
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1]">
              Premium Services.
              <span className="block text-[#8dc63f]">Real Results.</span>
            </h1>
            <p className="text-xl text-white/80 leading-relaxed max-w-2xl">
              We partner with industry-leading providers to deliver fiber internet, TV, and security
              solutions that customers actually want — and that you can sell with confidence.
            </p>
          </div>
        </div>
      </section>

      {/* Quick Nav */}
      <section className="py-6 bg-white border-b-2 border-gray-100 sticky top-[80px] z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-center gap-8">
            <a href="#fiber" className="group flex items-center gap-3 py-3 px-6 hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-[#6A8FE3] flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <span className="text-[#0A1F44] font-bold uppercase tracking-wide text-sm">Fiber</span>
            </a>
            <a href="#tv" className="group flex items-center gap-3 py-3 px-6 hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-[#8dc63f] flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-[#0A1F44] font-bold uppercase tracking-wide text-sm">TV</span>
            </a>
            <a href="#security" className="group flex items-center gap-3 py-3 px-6 hover:bg-gray-50 transition-colors">
              <div className="w-10 h-10 bg-[#0A1F44] flex items-center justify-center group-hover:scale-110 transition-transform">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <span className="text-[#0A1F44] font-bold uppercase tracking-wide text-sm">Security</span>
            </a>
          </div>
        </div>
      </section>

      {/* Fiber Internet */}
      <section id="fiber" className="py-24 bg-gray-50 scroll-mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left">
              <div className="relative">
                <Image
                  src="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80"
                  alt="Fiber optic internet"
                  width={600}
                  height={500}
                  className="object-cover shadow-sharp"
                />
                <div className="absolute -bottom-6 -right-6 bg-[#6A8FE3] text-white p-6 shadow-sharp hidden md:block">
                  <div className="text-3xl font-black">1 Gbps</div>
                  <div className="text-sm uppercase tracking-wide">Lightning Speed</div>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200}>
              <div className="inline-block bg-[#6A8FE3] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                High-Speed Connectivity
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                Fiber Internet
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Lightning-fast fiber optic technology that keeps up with modern demands.
                Streaming, gaming, remote work, smart home devices — all running
                seamlessly without slowdowns or data caps.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-white p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">Blazing Fast</div>
                  <div className="text-sm text-gray-600">Up to 1 Gbps speeds</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">99.9% Uptime</div>
                  <div className="text-sm text-gray-600">Rock-solid reliability</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">No Data Caps</div>
                  <div className="text-sm text-gray-600">Unlimited usage</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Symmetrical</div>
                  <div className="text-sm text-gray-600">Fast upload & download</div>
                </div>
              </div>

              <Link
                href="/contact"
                className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center gap-3"
              >
                Check Availability
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* TV Services */}
      <section id="tv" className="py-24 bg-white scroll-mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left" className="order-2 lg:order-1">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Premium Entertainment
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                TV Services
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Premium entertainment for the whole family. Hundreds of HD and 4K channels
                including live sports, breaking news, blockbuster movies, and on-demand
                content — all in crystal-clear quality.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-gray-50 p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">HD & 4K</div>
                  <div className="text-sm text-gray-600">Crystal clear picture</div>
                </div>
                <div className="bg-gray-50 p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Cloud DVR</div>
                  <div className="text-sm text-gray-600">Record your favorites</div>
                </div>
                <div className="bg-gray-50 p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">Watch Anywhere</div>
                  <div className="text-sm text-gray-600">Stream on any device</div>
                </div>
                <div className="bg-gray-50 p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Family Safe</div>
                  <div className="text-sm text-gray-600">Parental controls</div>
                </div>
              </div>

              <Link
                href="/contact"
                className="bg-[#6A8FE3] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#5578c9] transition-all shadow-sharp inline-flex items-center gap-3"
              >
                View Packages
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200} className="order-1 lg:order-2">
              <div className="relative">
                <Image
                  src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80"
                  alt="Family watching TV"
                  width={600}
                  height={500}
                  className="object-cover shadow-sharp"
                />
                <div className="absolute -bottom-6 -left-6 bg-[#8dc63f] text-white p-6 shadow-sharp hidden md:block">
                  <div className="text-3xl font-black">500+</div>
                  <div className="text-sm uppercase tracking-wide">Channels</div>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="py-24 bg-gray-50 scroll-mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left">
              <div className="relative">
                <Image
                  src="https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80"
                  alt="Home security system"
                  width={600}
                  height={500}
                  className="object-cover shadow-sharp"
                />
                <div className="absolute -bottom-6 -right-6 bg-[#0A1F44] text-white p-6 shadow-sharp hidden md:block">
                  <div className="text-3xl font-black">24/7</div>
                  <div className="text-sm uppercase tracking-wide">Monitoring</div>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200}>
              <div className="inline-block bg-[#0A1F44] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Home & Business Protection
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                Security Systems
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                Protect what matters most with comprehensive security solutions.
                Professional monitoring, smart home integration, HD cameras, and
                instant alerts give you total peace of mind.
              </p>

              <div className="grid grid-cols-2 gap-4 mb-10">
                <div className="bg-white p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">24/7 Monitoring</div>
                  <div className="text-sm text-gray-600">Always protected</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Smart Home</div>
                  <div className="text-sm text-gray-600">Full integration</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#8dc63f]">
                  <div className="font-black text-[#0A1F44]">HD Cameras</div>
                  <div className="text-sm text-gray-600">See everything</div>
                </div>
                <div className="bg-white p-4 border-l-4 border-[#6A8FE3]">
                  <div className="font-black text-[#0A1F44]">Pro Install</div>
                  <div className="text-sm text-gray-600">Expert setup</div>
                </div>
              </div>

              <Link
                href="/contact"
                className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center gap-3"
              >
                Get Protected
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Bundle CTA */}
      <section className="py-24 bg-[#0A1F44]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Maximum Value
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-6 leading-tight">
                Bundle & Save Big
              </h2>
              <p className="text-xl text-white/80 mb-8 leading-relaxed">
                Combine internet, TV, and security services for the best value.
                One provider. One bill. Total convenience.
              </p>

              <ul className="space-y-4 mb-10">
                <li className="flex items-center gap-4 text-white">
                  <div className="w-8 h-8 bg-[#8dc63f] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-lg">Save up to 30% with bundles</span>
                </li>
                <li className="flex items-center gap-4 text-white">
                  <div className="w-8 h-8 bg-[#8dc63f] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-lg">Single monthly bill</span>
                </li>
                <li className="flex items-center gap-4 text-white">
                  <div className="w-8 h-8 bg-[#8dc63f] flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <span className="text-lg">Priority customer support</span>
                </li>
              </ul>

              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/contact"
                  className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center justify-center gap-3"
                >
                  Get a Quote
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="/opportunities"
                  className="border-2 border-white text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-white hover:text-[#0A1F44] transition-all inline-flex items-center justify-center"
                >
                  Join Our Team
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200} className="hidden lg:block">
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white/10 backdrop-blur-sm p-6 text-center border border-white/20">
                  <svg className="w-10 h-10 text-[#8dc63f] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  <div className="text-white font-bold">Fiber</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-6 text-center border border-white/20">
                  <svg className="w-10 h-10 text-[#8dc63f] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <div className="text-white font-bold">TV</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-6 text-center border border-white/20">
                  <svg className="w-10 h-10 text-[#8dc63f] mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  <div className="text-white font-bold">Security</div>
                </div>
              </div>
              <div className="text-center mt-6">
                <div className="text-5xl font-black text-[#8dc63f]">= 30%</div>
                <div className="text-white/70 uppercase tracking-wide text-sm font-bold mt-2">Savings</div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Contractor CTA */}
      <section className="py-20 bg-[#8dc63f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Want to Sell These Services?
            </h2>
          <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
            Join our nationwide network of independent contractors and earn
            $1,000–$5,000+ weekly selling the services customers actually want.
          </p>
            <Link
              href="/apply"
              className="bg-white text-[#8dc63f] px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-gray-100 transition-all shadow-sharp inline-flex items-center justify-center gap-3"
            >
              Apply Now
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </ScrollReveal>
        </div>
      </section>
    </PageWrapper>
  );
}
