import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "Career Path | 3C World Group",
  description: "Build a career in sales with 3C World Group. We don't just offer commission – we build sales professionals. Earn $1,000-$5,000+ per week.",
};

export default function CareerPathPage() {
  return (
    <PageWrapper>
      {/* Hero - Dark Blue (accent concentration) */}
      <section className="bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#5578c9] text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
                NOW HIRING NATIONWIDE
              </span>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 leading-tight">
                Build Your Career in Sales
              </h1>
              <p className="text-xl text-white/90 leading-relaxed mb-8">
                We don't just offer commission — we build sales professionals. Join a team
                that invests in your growth with real training, mentorship, and a clear path forward.
              </p>
              <div className="flex flex-col sm:flex-row gap-4">
                <Link
                  href="/apply"
                  className="inline-block bg-[#8dc63f] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#7ab82e] transition-colors text-center shadow-lg"
                >
                  Start Your Application
                </Link>
                <Link
                  href="#how-it-works"
                  className="inline-block border-2 border-white/80 text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors text-center"
                >
                  See How It Works
                </Link>
              </div>
            </div>
            <div className="hidden md:block">
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 border border-white/20">
                <h3 className="text-2xl font-bold mb-6 flex items-center gap-3">
                  <div className="w-10 h-10 bg-[#8dc63f] rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Earning Potential
                </h3>
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70">Getting Started</span>
                      <span className="text-[#8dc63f] font-bold">$1k - $2k/week</span>
                    </div>
                    <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                      <div className="bg-[#8dc63f] h-3 rounded-full" style={{width: '35%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70">Building Momentum</span>
                      <span className="text-[#8dc63f] font-bold">$2k - $4k/week</span>
                    </div>
                    <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                      <div className="bg-[#8dc63f] h-3 rounded-full" style={{width: '65%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70">Top Performers</span>
                      <span className="text-[#8dc63f] font-bold">$5k+/week</span>
                    </div>
                    <div className="bg-white/20 rounded-full h-3 overflow-hidden">
                      <div className="bg-[#8dc63f] h-3 rounded-full" style={{width: '100%'}}></div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works - White background */}
      <section id="how-it-works" className="bg-white py-16 md:py-20">
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
            <div className="bg-gray-50 rounded-xl p-8 text-center hover:shadow-lg transition-all border-t-4 border-[#6A8FE3]">
              <div className="w-16 h-16 bg-[#6A8FE3] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Apply Online</h3>
              <p className="text-gray-600">
                Quick application — just your name, phone, email, and city.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-8 text-center hover:shadow-lg transition-all border-t-4 border-[#8dc63f]">
              <div className="w-16 h-16 bg-[#8dc63f] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Interview & Onboarding</h3>
              <p className="text-gray-600">
                Quick phone screen to make sure we're a good fit for each other.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-8 text-center hover:shadow-lg transition-all border-t-4 border-[#6A8FE3]">
              <div className="w-16 h-16 bg-[#6A8FE3] rounded-full flex items-center justify-center mx-auto mb-6 text-white text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Training & Territory</h3>
              <p className="text-gray-600">
                Comprehensive sales training and your own protected territory.
              </p>
            </div>

            <div className="bg-gray-50 rounded-xl p-8 text-center hover:shadow-lg transition-all border-t-4 border-[#8dc63f]">
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
            <Link
              href="/apply"
              className="inline-block bg-[#8dc63f] text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-[#7ab82e] transition-colors shadow-lg"
            >
              Get Started Today
            </Link>
          </div>
        </div>
      </section>

      {/* We Build Sales Professionals - Gray-50 background */}
      <section className="bg-gray-50 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#6A8FE3] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              CAREER DEVELOPMENT
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              We Build Sales Professionals
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              This isn't just a commission job. We invest in you with real training,
              ongoing coaching, and a structured path to leadership.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <div className="relative h-96">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/484896838.jpg"
                  alt="Sales training session"
                  fill
                  className="object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A1F44]/90 via-[#0A1F44]/40 to-transparent flex items-end justify-center pb-8">
                  <div className="text-center text-white">
                    <div className="text-3xl font-bold">Real Training</div>
                    <div className="text-lg opacity-90">Skills for Life</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[#8dc63f]">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Structured Training Program</h3>
                <p className="text-gray-600">
                  Comprehensive onboarding covering sales techniques, product knowledge, objection handling, and closing strategies.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[#6A8FE3]">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Weekly Coaching</h3>
                <p className="text-gray-600">
                  One-on-one sessions with experienced managers to sharpen your skills and track your progress.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[#8dc63f]">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Leadership Path</h3>
                <p className="text-gray-600">
                  Clear advancement opportunities to team lead, manager, and regional director positions.
                </p>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-sm border-l-4 border-[#6A8FE3]">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Skills for Life</h3>
                <p className="text-gray-600">
                  Communication, negotiation, and sales skills you'll use throughout your career.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What You'll Sell - White background */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#0A1F44] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              PRODUCTS
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              What You'll Sell
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Premium services from industry-leading providers that customers actually want.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-gray-50 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224687301-1.jpg"
                  alt="Fiber optic internet"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#6A8FE3] text-white px-3 py-1 rounded-full text-xs font-semibold">Internet</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Fiber Internet</h3>
                <p className="text-gray-600">Blazing-fast speeds for streaming, gaming, and work-from-home.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/1448455557.jpg"
                  alt="Family watching TV"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#8dc63f] text-white px-3 py-1 rounded-full text-xs font-semibold">Entertainment</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">TV Services</h3>
                <p className="text-gray-600">Premium entertainment with hundreds of HD channels.</p>
              </div>
            </div>

            <div className="bg-gray-50 rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224116080.jpg"
                  alt="Home security system"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#0A1F44] text-white px-3 py-1 rounded-full text-xs font-semibold">Security</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-2">Home Security</h3>
                <p className="text-gray-600">24/7 professional monitoring and smart home protection.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits - Dark Blue accent section */}
      <section className="bg-[#0A1F44] py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              BENEFITS
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              What We Offer
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              Everything you need to build a successful sales career.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Uncapped Commission</h3>
              <p className="text-white/70">No limits on what you can earn. Top performers take home $5k+ weekly.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Full Training Program</h3>
              <p className="text-white/70">Comprehensive onboarding, product knowledge, and ongoing coaching.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Flexible Schedule</h3>
              <p className="text-white/70">Set your own hours. Work when you want, where you want.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Protected Territory</h3>
              <p className="text-white/70">Your own designated area with quality leads and no overlap.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Career Growth</h3>
              <p className="text-white/70">Clear path to team lead and management positions.</p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 text-white border border-white/20">
              <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold mb-2">Nationwide Opportunities</h3>
              <p className="text-white/70">Positions available across 50+ states.</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Green accent */}
      <section className="bg-[#8dc63f] py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Build Your Career?
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Take the first step toward a rewarding career in sales.
            No experience required — we'll teach you everything you need to know.
          </p>
          <Link
            href="/apply"
            className="inline-block bg-white text-[#7ab82e] px-10 py-5 rounded-xl font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
          >
            Start Your Application
          </Link>
        </div>
      </section>
    </PageWrapper>
  );
}
