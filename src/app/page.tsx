import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";
import AnimatedCounter from "@/components/AnimatedCounter";
import ScrollReveal from "@/components/ScrollReveal";

export default function Home() {
  return (
    <PageWrapper>
      {/* Hero Section - Chipr-inspired bold layout */}
      <section className="bg-[#0A1F44] text-white min-h-[85vh] flex items-center relative overflow-hidden">
        {/* Background accent */}
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#6A8FE3]/20 to-transparent"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 relative z-10 w-full">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block bg-[#8dc63f] text-white px-5 py-2 font-bold text-sm uppercase tracking-wider mb-8">
                Now Hiring Nationwide
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1]">
                Drive Customer Acquisition.
                <span className="block text-[#8dc63f]">Build Your Future.</span>
              </h1>

              <p className="text-xl md:text-2xl text-white/80 mb-10 leading-relaxed max-w-xl">
                We specialize in face-to-face sales solutions for leading telecommunications providers.
                Join our network of independent contractors earning <strong className="text-white">$1,000–$5,000+ weekly</strong>.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-12">
                <Link
                  href="/apply"
                  className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center justify-center gap-3"
                >
                  Apply Now
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
                <Link
                  href="/services"
                  className="border-2 border-white text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-white hover:text-[#0A1F44] transition-all inline-flex items-center justify-center"
                >
                  Our Solutions
                </Link>
              </div>

              {/* Stats row */}
              <div className="flex flex-wrap gap-10">
                <div>
                  <div className="text-4xl font-black text-[#8dc63f]">1,000+</div>
                  <div className="text-white/60 text-sm uppercase tracking-wide">Active Contractors</div>
                </div>
                <div>
                  <div className="text-4xl font-black text-[#8dc63f]">50+</div>
                  <div className="text-white/60 text-sm uppercase tracking-wide">States Covered</div>
                </div>
                <div>
                  <div className="text-4xl font-black text-[#8dc63f]">$5k+</div>
                  <div className="text-white/60 text-sm uppercase tracking-wide">Weekly Potential</div>
                </div>
              </div>
            </div>

            {/* Hero image with sharp shadow */}
            <div className="hidden lg:block relative">
              <div className="relative">
                <Image
                  src="https://images.pexels.com/photos/7641866/pexels-photo-7641866.jpeg?auto=compress&cs=tinysrgb&w=800"
                  alt="Professional salesman talking to customers"
                  width={600}
                  height={700}
                  className="object-cover shadow-sharp-lg"
                />
                {/* Floating stat card */}
                <div className="absolute -bottom-8 -left-8 bg-white text-[#0A1F44] p-6 shadow-sharp">
                  <div className="text-3xl font-black text-[#8dc63f]">98%</div>
                  <div className="text-sm font-bold uppercase">Contractor Satisfaction</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do - Professional verbiage from Credico */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left">
              <div>
                <div className="inline-block bg-[#6A8FE3]/10 text-[#6A8FE3] px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                  What We Do
                </div>
                <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                  Simplifying Outsourced Sales for America's Leading Providers
                </h2>
                <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                  3C World Group coordinates face-to-face customer acquisition for telecommunications
                  and security providers nationwide. From strategy to execution, we deliver outstanding
                  results through direct sales interactions that build lasting customer relationships.
                </p>

                <div className="space-y-4 mb-8">
                  <div className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Direct Customer Engagement</div>
                      <div className="text-gray-600">Face-to-face interactions that convert prospects into loyal customers</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Nationwide Coverage</div>
                      <div className="text-gray-600">Operations spanning 50+ states with protected territories</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-4">
                    <div className="w-6 h-6 bg-[#8dc63f] flex items-center justify-center flex-shrink-0 mt-1">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-[#0A1F44]">Proven Methodology</div>
                      <div className="text-gray-600">Comprehensive training and ongoing support for consistent results</div>
                    </div>
                  </div>
                </div>

                <Link href="/about" className="inline-flex items-center gap-2 text-[#6A8FE3] font-bold uppercase tracking-wide hover:gap-4 transition-all">
                  Learn About Us
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                  </svg>
                </Link>
              </div>
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200}>
              <div className="relative">
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
                  alt="Team meeting"
                  width={600}
                  height={500}
                  className="object-cover shadow-sharp"
                />
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Services - with sharp shadow cards */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#0A1F44] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Our Solutions
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Premium Telecommunications Services
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                We partner with industry-leading providers to deliver solutions that customers actually want.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Fiber Internet */}
            <ScrollReveal delay={0}>
              <div className="bg-white border-2 border-[#0A1F44] shadow-sharp-sm hover:shadow-sharp transition-all group h-full">
                <div className="h-56 relative overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80"
                    alt="Fiber Internet"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Fiber Internet</h3>
                  <p className="text-gray-600 mb-6">
                    Lightning-fast fiber optic connectivity delivering speeds up to 1 Gbps for residential and commercial customers.
                  </p>
                  <Link href="/services#fiber" className="inline-flex items-center gap-2 text-[#6A8FE3] font-bold uppercase text-sm tracking-wide hover:gap-3 transition-all">
                    Learn More
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </ScrollReveal>

            {/* TV Services */}
            <ScrollReveal delay={150}>
              <div className="bg-white border-2 border-[#8dc63f] shadow-sharp-green hover:translate-x-[-4px] hover:translate-y-[-4px] transition-all group h-full">
                <div className="h-56 relative overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80"
                    alt="TV Services"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">TV Services</h3>
                  <p className="text-gray-600 mb-6">
                    Premium entertainment packages with hundreds of HD channels, cloud DVR, and on-demand content.
                  </p>
                  <Link href="/services#tv" className="inline-flex items-center gap-2 text-[#8dc63f] font-bold uppercase text-sm tracking-wide hover:gap-3 transition-all">
                    Learn More
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </ScrollReveal>

            {/* Security */}
            <ScrollReveal delay={300}>
              <div className="bg-white border-2 border-[#6A8FE3] shadow-sharp-blue hover:translate-x-[-4px] hover:translate-y-[-4px] transition-all group h-full">
                <div className="h-56 relative overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80"
                    alt="Security Systems"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Security Systems</h3>
                  <p className="text-gray-600 mb-6">
                    Complete home and business security with 24/7 professional monitoring and smart home integration.
                  </p>
                  <Link href="/services#security" className="inline-flex items-center gap-2 text-[#6A8FE3] font-bold uppercase text-sm tracking-wide hover:gap-3 transition-all">
                    Learn More
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </Link>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Stats Section with animated counters */}
      <section className="bg-[#0A1F44] py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            <div className="p-8">
              <AnimatedCounter end={1000} suffix="+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-3 uppercase tracking-wide text-sm font-bold">Contractors Nationwide</p>
            </div>
            <div className="p-8">
              <AnimatedCounter end={50} suffix="+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-3 uppercase tracking-wide text-sm font-bold">States Covered</p>
            </div>
            <div className="p-8">
              <AnimatedCounter end={5} prefix="$" suffix="k+" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-3 uppercase tracking-wide text-sm font-bold">Weekly Earning Potential</p>
            </div>
            <div className="p-8">
              <AnimatedCounter end={98} suffix="%" className="text-5xl font-black text-[#8dc63f]" />
              <p className="text-white/70 mt-3 uppercase tracking-wide text-sm font-bold">Contractor Satisfaction</p>
            </div>
          </div>
        </div>
      </section>

      {/* Expanding Markets Section */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Now Hiring
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Expanding Across America
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                We're actively recruiting independent contractors in these markets. Secure your protected territory today.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-4 gap-6">
            {/* Midwest */}
            <ScrollReveal delay={0}>
              <div className="bg-gray-50 p-6 border-l-4 border-[#6A8FE3] h-full">
                <h3 className="font-black text-[#0A1F44] uppercase tracking-wide text-sm mb-4">Midwest</h3>
              <ul className="space-y-2 text-gray-600">
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Chicago, IL
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Dayton, OH
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Grand Rapids, MI
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Lansing, MI
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Indianapolis, IN
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                  Lexington, KY
                </li>
              </ul>
              </div>
            </ScrollReveal>

            {/* Southwest */}
            <ScrollReveal delay={100}>
              <div className="bg-gray-50 p-6 border-l-4 border-[#8dc63f] h-full">
                <h3 className="font-black text-[#0A1F44] uppercase tracking-wide text-sm mb-4">Southwest</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Denver, CO
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Phoenix, AZ
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Albuquerque, NM
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Lubbock, TX
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Dallas, TX
                  </li>
                </ul>
              </div>
            </ScrollReveal>

            {/* Southeast */}
            <ScrollReveal delay={200}>
              <div className="bg-gray-50 p-6 border-l-4 border-[#6A8FE3] h-full">
                <h3 className="font-black text-[#0A1F44] uppercase tracking-wide text-sm mb-4">Southeast</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                    Birmingham, AL
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                    Atlanta, GA
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                    Savannah, GA
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                    Jacksonville, FL
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#8dc63f] rounded-full"></span>
                    Tallahassee, FL
                  </li>
                </ul>
              </div>
            </ScrollReveal>

            {/* East Coast */}
            <ScrollReveal delay={300}>
              <div className="bg-gray-50 p-6 border-l-4 border-[#8dc63f] h-full">
                <h3 className="font-black text-[#0A1F44] uppercase tracking-wide text-sm mb-4">East Coast</h3>
                <ul className="space-y-2 text-gray-600">
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Charleston, WV
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Baltimore, MD
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Philadelphia, PA
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 bg-[#6A8FE3] rounded-full"></span>
                    Pittsburgh, PA
                  </li>
                </ul>
              </div>
            </ScrollReveal>
          </div>

          <div className="text-center mt-12">
            <p className="text-gray-500 mb-6">Don't see your city? We're always expanding – apply and let us know where you're located.</p>
            <Link
              href="/apply"
              className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center gap-3"
            >
              Check Availability
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Career Opportunities - Credico-style professional content */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <ScrollReveal direction="left" className="order-2 lg:order-1">
              <Image
                src="https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=800&q=80"
                alt="Career opportunities"
                width={600}
                height={500}
                className="object-cover shadow-sharp"
              />
            </ScrollReveal>

            <ScrollReveal direction="right" delay={200} className="order-1 lg:order-2">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Career Opportunities
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6 leading-tight">
                Join a Team That Invests in Your Success
              </h2>
              <p className="text-lg text-gray-600 mb-8 leading-relaxed">
                We don't just offer commission – we build sales professionals. Our comprehensive training
                program, ongoing coaching, and clear advancement paths set you up for long-term success
                in the direct sales industry.
              </p>

              <div className="grid sm:grid-cols-2 gap-6 mb-10">
                <div className="bg-gray-50 p-6 border-l-4 border-[#8dc63f]">
                  <div className="text-2xl font-black text-[#8dc63f]">$1k–$5k+</div>
                  <div className="text-gray-600 text-sm">Weekly earning potential</div>
                </div>
                <div className="bg-gray-50 p-6 border-l-4 border-[#6A8FE3]">
                  <div className="text-2xl font-black text-[#6A8FE3]">Flexible</div>
                  <div className="text-gray-600 text-sm">Set your own schedule</div>
                </div>
                <div className="bg-gray-50 p-6 border-l-4 border-[#8dc63f]">
                  <div className="text-2xl font-black text-[#8dc63f]">Full Training</div>
                  <div className="text-gray-600 text-sm">No experience required</div>
                </div>
                <div className="bg-gray-50 p-6 border-l-4 border-[#6A8FE3]">
                  <div className="text-2xl font-black text-[#6A8FE3]">Growth Path</div>
                  <div className="text-gray-600 text-sm">Leadership opportunities</div>
                </div>
              </div>

              <Link
                href="/opportunities"
                className="bg-[#8dc63f] text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center gap-3"
              >
                Explore Careers
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#6A8FE3] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Get Started
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Your Path to Success
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                From application to your first paycheck – we make the process simple and straightforward.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "01", title: "Apply Online", desc: "Quick 30-second application with basic information" },
              { num: "02", title: "Interview", desc: "Brief phone call to ensure we're the right fit" },
              { num: "03", title: "Training", desc: "Comprehensive onboarding and territory assignment" },
              { num: "04", title: "Start Earning", desc: "Hit the ground running with full support" },
            ].map((step, index) => (
              <ScrollReveal key={index} delay={index * 100}>
                <div className="bg-white p-8 shadow-sharp-sm border-t-4 border-[#8dc63f] h-full">
                  <div className="text-4xl font-black text-[#8dc63f] mb-3">{step.num}</div>
                  <h3 className="text-xl font-black text-[#0A1F44] mb-2">{step.title}</h3>
                  <p className="text-gray-700">{step.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/apply"
              className="bg-[#0A1F44] text-white px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#1a3a6e] transition-all shadow-sharp inline-flex items-center gap-3"
            >
              Start Your Application
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="bg-[#8dc63f] py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Ready to Take Control of Your Income?
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Join our nationwide network of successful sales professionals.
              No experience required – we'll teach you everything you need to succeed.
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
