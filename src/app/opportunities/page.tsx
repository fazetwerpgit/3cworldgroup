import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";
import FAQAccordion from "@/components/FAQAccordion";
import AnimatedCounter from "@/components/AnimatedCounter";
import ScrollReveal from "@/components/ScrollReveal";

export const metadata = {
  title: "Career Path | 3C World Group",
  description: "Build a career in sales with 3C World Group. We don't just offer commission – we build sales professionals. Earn $1,000-$5,000+ per week.",
};

const faqs = [
  {
    question: "Do I need sales experience to join?",
    answer: "No! Many of our most successful contractors came from completely different backgrounds – retail, hospitality, teaching, and more. We provide comprehensive training that covers everything from product knowledge to advanced sales techniques. If you have motivation and a positive attitude, we'll teach you the rest.",
  },
  {
    question: "How much can I realistically earn?",
    answer: "Earnings vary based on effort and territory, but our contractors typically earn between $1,000-$5,000+ per week. Getting started, most contractors earn $1,000-$2,000 weekly. As you build skills and momentum, $3,000-$4,000 weekly is common. Our top performers consistently earn $5,000+ per week. There's no cap on earnings – your income grows with your effort.",
  },
  {
    question: "What does the training program include?",
    answer: "Our comprehensive training covers: product knowledge for all service lines (fiber, TV, security), proven sales techniques and scripts, objection handling strategies, territory management, CRM and technology tools, and ongoing weekly coaching. You'll never be left to figure things out on your own.",
  },
  {
    question: "How does the scheduling work?",
    answer: "As an independent contractor, you have full control over your schedule. Most contractors work 5-6 days per week, 6-8 hours per day, but you decide when and where you work. Some prefer mornings, others prefer evenings. Many of our contractors work 4-day weeks and still earn great income.",
  },
  {
    question: "What territories are available?",
    answer: "We have opportunities in 50+ states across the country. When you join, you'll be assigned a protected territory based on your location. We ensure there's no overlap with other contractors so you have dedicated areas to work.",
  },
  {
    question: "How quickly can I start earning?",
    answer: "Most contractors make their first sale within the first week of training. After completing our onboarding program (typically 3-5 days), you'll be ready to hit the ground running. Many contractors see their first paycheck within 2-3 weeks of starting.",
  },
];

export default function CareerPathPage() {
  return (
    <PageWrapper>
      {/* Hero - Bold Chipr-style */}
      <section className="bg-[#0A1F44] text-white py-24 md:py-32 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#6A8FE3]/20 to-transparent"></div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid lg:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block bg-[#8dc63f] text-white px-5 py-2 font-bold text-sm uppercase tracking-wider mb-8">
                Now Hiring Nationwide
              </div>
              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black mb-8 leading-[1.1]">
                Build a Career.
                <span className="block text-[#8dc63f]">Not Just a Job.</span>
              </h1>
              <p className="text-xl text-white/80 leading-relaxed max-w-xl mb-10">
                We don't just offer commission — we build sales professionals. Join a team
                that invests in your growth with real training, mentorship, and a clear path forward.
              </p>

              <div className="flex flex-col sm:flex-row gap-4">
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
                  href="#how-it-works"
                  className="border-2 border-white text-white px-10 py-5 font-bold text-lg uppercase tracking-wide hover:bg-white hover:text-[#0A1F44] transition-all inline-flex items-center justify-center"
                >
                  How It Works
                </Link>
              </div>
            </div>

            {/* Earning Potential Card */}
            <div className="hidden lg:block">
              <div className="bg-white/10 backdrop-blur-sm p-10 border border-white/20">
                <h3 className="text-2xl font-black mb-8 flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#8dc63f] flex items-center justify-center">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  Earning Potential
                </h3>
                <div className="space-y-6">
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70 uppercase tracking-wide font-bold">Getting Started</span>
                      <span className="text-[#8dc63f] font-black text-lg">$1k–$2k/week</span>
                    </div>
                    <div className="bg-white/20 h-4 overflow-hidden">
                      <div className="bg-[#8dc63f] h-4" style={{width: '35%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70 uppercase tracking-wide font-bold">Building Momentum</span>
                      <span className="text-[#8dc63f] font-black text-lg">$2k–$4k/week</span>
                    </div>
                    <div className="bg-white/20 h-4 overflow-hidden">
                      <div className="bg-[#8dc63f] h-4" style={{width: '65%'}}></div>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-white/70 uppercase tracking-wide font-bold">Top Performers</span>
                      <span className="text-[#8dc63f] font-black text-lg">$5k+/week</span>
                    </div>
                    <div className="bg-white/20 h-4 overflow-hidden">
                      <div className="bg-[#8dc63f] h-4" style={{width: '100%'}}></div>
                    </div>
                  </div>
                </div>
                <p className="text-white/60 text-sm mt-6 uppercase tracking-wide">
                  No caps. No limits. Your effort = your income.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="bg-white py-10 border-b-2 border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            <div>
              <AnimatedCounter end={1000} suffix="+" className="text-4xl font-black text-[#8dc63f]" />
              <div className="text-gray-600 text-sm uppercase tracking-wide font-bold mt-1">Active Contractors</div>
            </div>
            <div>
              <AnimatedCounter end={50} suffix="+" className="text-4xl font-black text-[#8dc63f]" />
              <div className="text-gray-600 text-sm uppercase tracking-wide font-bold mt-1">States Covered</div>
            </div>
            <div>
              <AnimatedCounter end={5} prefix="$" suffix="k+" className="text-4xl font-black text-[#8dc63f]" />
              <div className="text-gray-600 text-sm uppercase tracking-wide font-bold mt-1">Top Weekly Earnings</div>
            </div>
            <div>
              <AnimatedCounter end={30} suffix="%" className="text-4xl font-black text-[#8dc63f]" />
              <div className="text-gray-600 text-sm uppercase tracking-wide font-bold mt-1">Promoted to Leadership</div>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="bg-gray-50 py-24 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Get Started
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Your Path to Success
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                From application to your first paycheck in four simple steps.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-4 gap-8">
            {[
              { num: "01", title: "Apply Online", desc: "Quick application — just your name, phone, email, and city. Takes 30 seconds.", color: "border-[#6A8FE3]" },
              { num: "02", title: "Interview", desc: "Quick 15-minute phone call to make sure we're a good fit for each other.", color: "border-[#8dc63f]" },
              { num: "03", title: "Training", desc: "Comprehensive sales training and your own protected territory assignment.", color: "border-[#6A8FE3]" },
              { num: "04", title: "Start Earning", desc: "Hit the ground running with support from day one. Unlimited earning potential!", color: "border-[#8dc63f]" },
            ].map((step, index) => (
              <ScrollReveal key={index} delay={index * 100}>
                <div className={`bg-white p-8 shadow-sharp-sm border-t-4 ${step.color} h-full`}>
                  <div className="text-4xl font-black text-[#8dc63f] mb-4">{step.num}</div>
                  <h3 className="text-xl font-black text-[#0A1F44] mb-3">{step.title}</h3>
                  <p className="text-gray-600">{step.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              href="/apply"
              className="bg-[#8dc63f] text-white px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-[#7ab82e] transition-all shadow-sharp inline-flex items-center gap-3"
            >
              Get Started Today
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>
        </div>
      </section>

      {/* What You'll Sell */}
      <section className="bg-white py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#0A1F44] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Products
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                What You'll Sell
              </h2>
              <p className="text-lg text-gray-600 max-w-2xl mx-auto">
                Premium services from industry-leading providers that customers actually want.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-3 gap-8">
            <ScrollReveal delay={0}>
              <div className="bg-white border-2 border-[#6A8FE3] shadow-sharp-blue group h-full">
              <div className="relative h-56 overflow-hidden">
                <Image
                  src="https://images.unsplash.com/photo-1544197150-b99a580bb7a8?auto=format&fit=crop&w=800&q=80"
                  alt="Fiber optic internet"
                  fill
                  className="object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-4 left-4 bg-[#6A8FE3] text-white px-3 py-1 font-bold text-xs uppercase">
                  Internet
                </div>
              </div>
              <div className="p-8">
                <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Fiber Internet</h3>
                <p className="text-gray-600">Blazing-fast speeds for streaming, gaming, and work-from-home. Easy sell — everyone needs internet.</p>
              </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={150}>
              <div className="bg-white border-2 border-[#8dc63f] shadow-sharp-green group h-full">
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?auto=format&fit=crop&w=800&q=80"
                    alt="Family watching TV"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-[#8dc63f] text-white px-3 py-1 font-bold text-xs uppercase">
                    Entertainment
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">TV Services</h3>
                  <p className="text-gray-600">Premium entertainment with hundreds of HD channels. Families love it — great upsell opportunity.</p>
                </div>
              </div>
            </ScrollReveal>

            <ScrollReveal delay={300}>
              <div className="bg-white border-2 border-[#0A1F44] shadow-sharp group h-full">
                <div className="relative h-56 overflow-hidden">
                  <Image
                    src="https://images.unsplash.com/photo-1558002038-1055907df827?auto=format&fit=crop&w=800&q=80"
                    alt="Home security system"
                    fill
                    className="object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute top-4 left-4 bg-[#0A1F44] text-white px-3 py-1 font-bold text-xs uppercase">
                    Security
                  </div>
                </div>
                <div className="p-8">
                  <h3 className="text-2xl font-black text-[#0A1F44] mb-3">Home Security</h3>
                  <p className="text-gray-600">24/7 professional monitoring and smart home protection. Peace of mind sells itself.</p>
                </div>
              </div>
            </ScrollReveal>
          </div>
        </div>
      </section>

      {/* Benefits Grid */}
      <section className="bg-[#0A1F44] py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-16">
              <div className="inline-block bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                Benefits
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
                What We Offer
              </h2>
              <p className="text-lg text-white/70 max-w-2xl mx-auto">
                Everything you need to build a successful sales career.
              </p>
            </div>
          </ScrollReveal>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { icon: "M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Uncapped Commission", desc: "No limits on what you can earn. Top performers take home $5k+ weekly." },
              { icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253", title: "Full Training Program", desc: "Comprehensive onboarding, product knowledge, and ongoing coaching." },
              { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", title: "Flexible Schedule", desc: "Set your own hours. Work when you want, where you want." },
              { icon: "M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7", title: "Protected Territory", desc: "Your own designated area with quality leads and no overlap." },
              { icon: "M13 7h8m0 0v8m0-8l-8 8-4-4-6 6", title: "Career Growth", desc: "Clear path to team lead and management positions." },
              { icon: "M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z", title: "Nationwide Opportunities", desc: "Positions available across 50+ states." },
            ].map((benefit, index) => (
              <ScrollReveal key={index} delay={index * 100}>
                <div className="bg-white/10 backdrop-blur-sm p-8 text-white border border-white/20 h-full">
                  <div className="w-14 h-14 bg-[#8dc63f] flex items-center justify-center mb-6">
                    <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={benefit.icon} />
                    </svg>
                  </div>
                  <h3 className="text-xl font-black mb-3">{benefit.title}</h3>
                  <p className="text-white/70">{benefit.desc}</p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-gray-50 py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <ScrollReveal>
            <div className="text-center mb-12">
              <div className="inline-block bg-[#6A8FE3] text-white px-4 py-2 font-bold text-sm uppercase tracking-wider mb-6">
                FAQ
              </div>
              <h2 className="text-4xl md:text-5xl font-black text-[#0A1F44] mb-6">
                Frequently Asked Questions
              </h2>
              <p className="text-lg text-gray-600">
                Got questions? We've got answers.
              </p>
            </div>
          </ScrollReveal>

          <ScrollReveal delay={200}>
            <div className="bg-white shadow-sharp p-8">
              <FAQAccordion items={faqs} />
            </div>
          </ScrollReveal>

          <div className="text-center mt-10">
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

      {/* CTA Section */}
      <section className="py-20 bg-[#8dc63f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <ScrollReveal>
            <h2 className="text-4xl md:text-5xl font-black text-white mb-6">
              Ready to Build Your Career?
            </h2>
            <p className="text-xl text-white/90 mb-10 max-w-2xl mx-auto">
              Take the first step toward a rewarding career in sales.
              No experience required — we'll teach you everything you need to know.
            </p>
            <Link
              href="/apply"
              className="bg-white text-[#8dc63f] px-12 py-5 font-bold text-lg uppercase tracking-wide hover:bg-gray-100 transition-all shadow-sharp inline-flex items-center justify-center gap-3"
            >
              Start Your Application
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
