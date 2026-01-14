import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";

export default function Home() {
  return (
    <PageWrapper>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#5578c9] text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
                NOW HIRING NATIONWIDE
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                High-Earning Sales Contractor Opportunities
              </h1>
              <p className="text-xl text-white/90 mb-8 leading-relaxed">
                Unlock your potential with 3C World Group. Join our nationwide team selling fiber internet,
                TV services, and security solutions. Earn <strong>$1k–$5k+ per week</strong> with flexible schedules and
                full training provided.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link href="/apply" className="inline-block bg-[#8dc63f] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#7ab82e] transition-colors text-center shadow-lg">
                  Apply Now
                </Link>
                <Link href="/opportunities" className="inline-block border-2 border-white/80 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors text-center">
                  Learn More
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <h3 className="text-2xl font-bold mb-6">Why Join Us?</h3>
                <div className="space-y-5">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-lg">Uncapped Earnings</div>
                      <div className="text-white/80">Top performers earn $5k+ weekly</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-lg">Flexible Schedule</div>
                      <div className="text-white/80">Work when and where you want</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="font-bold text-lg">Full Training</div>
                      <div className="text-white/80">No experience required</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Services Section */}
      <section className="bg-gray-50 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              Our Services
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We partner with industry-leading providers to deliver premium telecommunications and security solutions.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Fiber Internet Card */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="h-48 relative">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224687301-1.jpg"
                  alt="Fiber optic internet installation"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#6A8FE3] text-white px-3 py-1 rounded-full text-xs font-semibold">Internet</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Fiber Internet</h3>
                <p className="text-gray-600 mb-4">
                  Lightning-fast fiber optic connections delivering speeds up to 1 Gbps for homes and businesses.
                </p>
                <Link href="/services#fiber" className="text-[#6A8FE3] font-semibold hover:text-[#5578c9] inline-flex items-center gap-1 transition-colors">
                  Learn More
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* TV Services Card */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="h-48 relative">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/1448455557.jpg"
                  alt="Family watching TV at home"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#8dc63f] text-white px-3 py-1 rounded-full text-xs font-semibold">Entertainment</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Reliable TV Services</h3>
                <p className="text-gray-600 mb-4">
                  Premium entertainment packages with hundreds of channels, HD quality, and on-demand content.
                </p>
                <Link href="/services#tv" className="text-[#8dc63f] font-semibold hover:text-[#7ab82e] inline-flex items-center gap-1 transition-colors">
                  Learn More
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>

            {/* Security Card */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="h-48 relative">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224116080.jpg"
                  alt="Modern home security technology"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#0A1F44] text-white px-3 py-1 rounded-full text-xs font-semibold">Security</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Advanced Security</h3>
                <p className="text-gray-600 mb-4">
                  Complete home and business security with 24/7 monitoring, smart home integration, and HD cameras.
                </p>
                <Link href="/services#security" className="text-[#6A8FE3] font-semibold hover:text-[#5578c9] inline-flex items-center gap-1 transition-colors">
                  Learn More
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Join Section */}
      <section className="bg-gradient-to-b from-[#f0f5fa] to-[#e8f0f8] py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#6A8FE3] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              JOIN OUR TEAM
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              Why Join 3C World Group?
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Build a rewarding career with unlimited potential
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            <div className="rounded-2xl overflow-hidden shadow-xl ring-1 ring-[#6A8FE3]/20">
              <div className="relative h-72">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2198220817.jpg"
                  alt="Independent contractor working"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1F44]/90 via-[#0A1F44]/40 to-transparent flex items-end justify-center pb-6">
                  <div className="text-center text-white">
                    <div className="text-4xl font-bold">$1k–$5k</div>
                    <div className="text-lg opacity-90">Per Week Earnings</div>
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#6A8FE3]/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#0A1F44]">Uncapped Earning Potential</h3>
              </div>
              <p className="text-gray-600 text-lg leading-relaxed">
                Our top contractors consistently earn $5,000+ per week. With competitive commission rates
                and performance bonuses, your income is only limited by your effort. No salary caps,
                no limits on success.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center mb-16">
            <div className="order-2 md:order-1 bg-white rounded-2xl p-8 shadow-lg border border-[#6A8FE3]/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#0A1F44]">Career Growth Opportunities</h3>
              </div>
              <p className="text-gray-600 text-lg leading-relaxed">
                We don't just offer commission – we build sales professionals. Full training program,
                weekly coaching, and clear advancement paths to team lead and management positions.
                Skills you'll use for life.
              </p>
            </div>
            <div className="order-1 md:order-2 rounded-2xl overflow-hidden shadow-xl ring-1 ring-[#6A8FE3]/20">
              <div className="relative h-72">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/484896838.jpg"
                  alt="Career growth and training"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1F44]/90 via-[#0A1F44]/40 to-transparent flex items-end justify-center pb-6">
                  <div className="text-center text-white">
                    <div className="text-4xl font-bold">Leadership</div>
                    <div className="text-lg opacity-90">Path to Management</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="bg-gradient-to-br from-[#6A8FE3] to-[#5578c9] rounded-2xl p-10 flex items-center justify-center shadow-xl">
              <div className="text-center text-white">
                <div className="text-4xl font-bold mb-2">Be Your</div>
                <div className="text-5xl font-bold text-[#8dc63f]">Own Boss</div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-8 shadow-lg border border-[#6A8FE3]/10">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold text-[#0A1F44]">Flexible Independence</h3>
              </div>
              <p className="text-gray-600 text-lg leading-relaxed">
                As an independent contractor, you control your schedule and work-life balance.
                Set your own hours, build your own business, and enjoy the freedom of being your own boss
                while having the support of an established company.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-[#0A1F44] py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-3 gap-8 text-center">
            <div className="p-6">
              <div className="text-5xl font-bold text-[#8dc63f] mb-2">50+</div>
              <div className="text-white/80 text-lg">States Covered</div>
            </div>
            <div className="p-6 md:border-x border-white/10">
              <div className="text-5xl font-bold text-[#8dc63f] mb-2">1,000+</div>
              <div className="text-white/80 text-lg">Contractors Nationwide</div>
            </div>
            <div className="p-6">
              <div className="text-5xl font-bold text-[#8dc63f] mb-2">$5k/wk+</div>
              <div className="text-white/80 text-lg">Top Contractor Earnings</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-gradient-to-b from-[#f5f9f2] to-[#eef5e8] py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              GET STARTED
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              How It Works
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              From application to your first paycheck in four simple steps.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-8">
            <div className="bg-white rounded-xl p-8 text-center shadow-lg hover:shadow-xl transition-all border-t-4 border-[#6A8FE3] hover:-translate-y-1">
              <div className="w-16 h-16 bg-[#6A8FE3] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Apply Online</h3>
              <p className="text-gray-600">
                Quick application – just name, phone, email, and city.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 text-center shadow-lg hover:shadow-xl transition-all border-t-4 border-[#8dc63f] hover:-translate-y-1">
              <div className="w-16 h-16 bg-[#8dc63f] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Interview</h3>
              <p className="text-gray-600">
                Quick phone screen to make sure we're a good fit.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 text-center shadow-lg hover:shadow-xl transition-all border-t-4 border-[#6A8FE3] hover:-translate-y-1">
              <div className="w-16 h-16 bg-[#6A8FE3] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Training</h3>
              <p className="text-gray-600">
                Full sales training and territory assignment.
              </p>
            </div>

            <div className="bg-white rounded-xl p-8 text-center shadow-lg hover:shadow-xl transition-all border-t-4 border-[#8dc63f] hover:-translate-y-1">
              <div className="w-16 h-16 bg-[#8dc63f] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                4
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Start Earning</h3>
              <p className="text-gray-600">
                Hit the ground running with support from day one.
              </p>
            </div>
          </div>

          <div className="text-center mt-10">
            <Link href="/opportunities" className="inline-block bg-[#8dc63f] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#7ab82e] transition-colors shadow-lg">
              View Career Paths
            </Link>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-[#7ab82e] to-[#8dc63f] py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Start Your Career?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Join our team of successful contractors and take control of your income today.
          </p>
          <Link
            href="/apply"
            className="inline-block bg-white text-[#7ab82e] px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
          >
            Apply Now
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
