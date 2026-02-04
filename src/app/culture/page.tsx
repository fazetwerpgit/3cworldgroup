import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "Our Culture | 3C World Group",
  description: "Discover the values and culture that drive 3C World Group. Learn about our commitment to Connection, Community, and Commitment.",
};

export default function CulturePage() {
  const values = [
    {
      letter: "C",
      title: "Connection",
      description: "We connect people – customers with the services they need, and contractors with opportunities that change their lives. Every interaction is an opportunity to build meaningful relationships.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
        </svg>
      ),
      color: "#8dc63f",
    },
    {
      letter: "C",
      title: "Community",
      description: "We're more than a company – we're a family. Our contractors support each other, celebrate wins together, and work as a team to serve their communities. You're never alone in your journey.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
      ),
      color: "#6A8FE3",
    },
    {
      letter: "C",
      title: "Commitment",
      description: "We're committed to excellence in everything we do – from the quality of services we offer to the training and support we provide. We don't just set you up for success; we invest in your long-term growth.",
      icon: (
        <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
        </svg>
      ),
      color: "#0A1F44",
    },
  ];

  const principles = [
    {
      title: "Respect",
      description: "We uphold respect for one another, act ethically in all interactions, and accept accountability for our actions. Every contractor, customer, and partner deserves to be treated with dignity.",
    },
    {
      title: "Quality",
      description: "We deliver accurate, timely, and reliable support. Our products and services meet the highest standards, and we stand behind everything we sell.",
    },
    {
      title: "Teamwork",
      description: "Success is a team sport. We foster an inclusive, collaborative environment where everyone contributes to our shared goals. When one of us wins, we all win.",
    },
    {
      title: "Growth",
      description: "We embrace transformation and innovation. Every challenge is an opportunity to learn, improve, and become better versions of ourselves.",
    },
  ];

  return (
    <PageWrapper>
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#5578c9] text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
              WHO WE ARE
            </span>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6">
              Our Culture & Values
            </h1>
            <p className="text-xl text-white/90 max-w-3xl mx-auto leading-relaxed">
              At 3C World Group, we believe that the only way to succeed is together. Our culture is built on
              shared values that guide everything we do.
            </p>
          </div>
        </div>
      </section>

      {/* The 3 C's Section */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              The 3 C's That Drive Us
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Our name isn't just a brand – it represents the core values that guide every decision we make.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {values.map((value, index) => (
              <div
                key={index}
                className="bg-gray-50 rounded-2xl p-8 text-center hover-lift border-t-4"
                style={{ borderTopColor: value.color }}
              >
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 text-white"
                  style={{ backgroundColor: value.color }}
                >
                  {value.icon}
                </div>
                <div
                  className="text-5xl font-black mb-2"
                  style={{ color: value.color }}
                >
                  {value.letter}
                </div>
                <h3 className="text-2xl font-bold text-[#0A1F44] mb-4">{value.title}</h3>
                <p className="text-gray-600 leading-relaxed">{value.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Our Principles */}
      <section className="bg-gray-50 py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-[#6A8FE3]/10 text-[#6A8FE3] px-4 py-2 rounded-full text-sm font-semibold mb-4">
                OUR PRINCIPLES
              </span>
              <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-6">
                How We Operate
              </h2>
              <p className="text-lg text-gray-600 mb-8">
                These principles shape our daily interactions and drive our commitment to excellence.
              </p>

              <div className="space-y-6">
                {principles.map((principle, index) => (
                  <div key={index} className="bg-white rounded-xl p-6 shadow-sm border-l-4 border-[#8dc63f]">
                    <h3 className="text-xl font-bold text-[#0A1F44] mb-2">{principle.title}</h3>
                    <p className="text-gray-600">{principle.description}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="relative">
              <div className="rounded-2xl overflow-hidden shadow-2xl">
                <Image
                  src="https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=800&q=80"
                  alt="Team collaboration"
                  width={600}
                  height={700}
                  className="object-cover"
                />
              </div>
              {/* Floating stats card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-xl p-6 shadow-xl border border-gray-100">
                <div className="text-4xl font-bold text-[#8dc63f] mb-1">98%</div>
                <div className="text-gray-600 text-sm">Contractor Satisfaction</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Team Life Section */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f]/10 text-[#8dc63f] px-4 py-2 rounded-full text-sm font-semibold mb-4">
              LIFE AT 3C
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              What It's Like to Work With Us
            </h2>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { title: "Weekly Team Calls", desc: "Connect with your team, share wins, and learn from each other" },
              { title: "Recognition Programs", desc: "Top performers are celebrated and rewarded regularly" },
              { title: "Ongoing Training", desc: "Continuous learning opportunities to sharpen your skills" },
              { title: "Mentorship", desc: "Experienced contractors guide newcomers to success" },
              { title: "Community Events", desc: "Regional meetups and annual conferences" },
              { title: "Open Communication", desc: "Leadership is always accessible and transparent" },
            ].map((item, index) => (
              <div key={index} className="bg-gray-50 rounded-xl p-6 hover-lift">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-xl flex items-center justify-center mb-4">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-lg font-bold text-[#0A1F44] mb-2">{item.title}</h3>
                <p className="text-gray-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Community Involvement */}
      <section className="bg-[#0A1F44] py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              GIVING BACK
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
              Community Involvement
            </h2>
            <p className="text-lg text-white/70 max-w-2xl mx-auto">
              We believe in making a positive impact beyond business. Our team actively supports
              local communities and charitable causes.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white border border-white/20">
              <div className="w-14 h-14 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Local Charities</h3>
              <p className="text-white/70">
                We partner with food banks, shelters, and community organizations in the areas where our contractors work.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white border border-white/20">
              <div className="w-14 h-14 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Youth Programs</h3>
              <p className="text-white/70">
                Supporting education and mentorship programs that help young people develop skills for the workforce.
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-8 text-white border border-white/20">
              <div className="w-14 h-14 bg-[#8dc63f] rounded-xl flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold mb-3">Environmental Impact</h3>
              <p className="text-white/70">
                Promoting sustainable practices and supporting environmental initiatives in our communities.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gradient-to-r from-[#7ab82e] to-[#8dc63f] py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Ready to Join Our Culture?
          </h2>
          <p className="text-xl text-white/90 mb-8 max-w-2xl mx-auto">
            Experience firsthand what makes 3C World Group special. Join a team that values
            your success as much as you do.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/apply"
              className="inline-block bg-white text-[#7ab82e] px-10 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-all shadow-lg hover-scale"
            >
              Join Our Team
            </Link>
            <Link
              href="/testimonials"
              className="inline-block border-2 border-white text-white px-10 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Read Success Stories
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
