import Link from "next/link";
import Image from "next/image";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "About Us | 3C World Group",
  description: "3C World Group specializes in nationwide B2C sales of Fiber Internet, TV, and Security services, delivering reliable solutions for homes and businesses.",
};

export default function AboutPage() {
  return (
    <PageWrapper>
      {/* Hero - Dark Blue (accent concentration) */}
      <section className="bg-gradient-to-br from-[#0A1F44] via-[#1a3a6e] to-[#5578c9] text-white py-20 md:py-28">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div>
              <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-6">
                OUR STORY
              </span>
              <h1 className="text-4xl md:text-5xl font-bold mb-6">
                About 3C World Group
              </h1>
              <p className="text-xl text-white/90 leading-relaxed">
                3C World Group specializes in nationwide B2C sales of Fiber Internet, TV, and Security services,
                delivering reliable solutions for homes and businesses, and offering high-earning opportunities
                for contractor sales reps.
              </p>
            </div>
            <div className="hidden md:block">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center border border-white/20">
                  <div className="text-4xl font-bold text-[#8dc63f] mb-2">50+</div>
                  <div className="text-white/80">States Served</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center border border-white/20">
                  <div className="text-4xl font-bold text-[#8dc63f] mb-2">1,000+</div>
                  <div className="text-white/80">Contractors</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center border border-white/20">
                  <div className="text-4xl font-bold text-[#8dc63f] mb-2">$5k+</div>
                  <div className="text-white/80">Weekly Earnings</div>
                </div>
                <div className="bg-white/10 backdrop-blur-sm rounded-xl p-6 text-center border border-white/20">
                  <div className="text-4xl font-bold text-[#8dc63f] mb-2">3</div>
                  <div className="text-white/80">Service Categories</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Our Mission - White background */}
      <section className="bg-white py-16 md:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="rounded-2xl overflow-hidden shadow-xl">
              <div className="relative h-80">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/484896838.jpg"
                  alt="3C World Group sales team"
                  fill
                  className="object-cover"
                />
              </div>
            </div>
            <div>
              <span className="inline-block bg-[#6A8FE3] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
                OUR MISSION
              </span>
              <h2 className="text-3xl font-bold text-[#0A1F44] mb-6">
                Empowering Sales Professionals and Connecting America
              </h2>
              <div className="border-l-4 border-[#8dc63f] pl-6 space-y-4">
                <p className="text-gray-600 leading-relaxed">
                  3C World Group operates a nationwide network of independent contractors delivering
                  Fiber Internet, TV, and Security solutions to homes and businesses in every corner
                  of the United States, ensuring reliable connectivity for families and businesses.
                </p>
                <p className="text-gray-600 leading-relaxed">
                  We provide ambitious sales professionals and entrepreneurs with the tools and support
                  they need to succeed. Our contractors have the potential to earn{" "}
                  <strong className="text-[#8dc63f]">$1,000–$5,000 per week</strong> while
                  building their own sales business.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Leadership Team - Gray background */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              MEET THE TEAM
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              Our Leadership Team
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Meet the people driving 3C World Group's mission to connect America.
            </p>
          </div>

          <div className="grid md:grid-cols-4 gap-6">
            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-t-4 border-[#6A8FE3]">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-[#6A8FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0A1F44] mb-1">Jeremy McFarland</h3>
              <p className="text-gray-600 font-medium">Founder & CEO</p>
            </div>

            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-t-4 border-[#8dc63f]">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-[#8dc63f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0A1F44] mb-1">William Teasdale</h3>
              <p className="text-gray-600 font-medium">Director of Sales</p>
            </div>

            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-t-4 border-[#6A8FE3]">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-[#6A8FE3]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0A1F44] mb-1">Jacob Myers</h3>
              <p className="text-gray-600 font-medium">Operations</p>
            </div>

            <div className="bg-white rounded-2xl p-6 text-center shadow-sm border-t-4 border-[#8dc63f]">
              <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-12 h-12 text-[#8dc63f]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-[#0A1F44] mb-1">Braeden Crouse</h3>
              <p className="text-gray-600 font-medium">Onboarding Department</p>
            </div>
          </div>
        </div>
      </section>

      {/* The 3 C's - White background */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#6A8FE3] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              OUR VALUES
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              The 3 C's That Drive Us
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Our name represents the core values that guide every decision we make.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {/* Connection */}
            <div className="bg-gray-50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/2224687301-1.jpg"
                  alt="Connection - Fiber optic technology"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#8dc63f] text-white px-3 py-1 rounded-full text-xs font-bold">C</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Connection</h3>
                <p className="text-gray-600">
                  We connect people – customers with the services they need, and contractors with
                  opportunities that change their lives.
                </p>
              </div>
            </div>

            {/* Community */}
            <div className="bg-gray-50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/484896838.jpg"
                  alt="Community - Team collaboration"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#6A8FE3] text-white px-3 py-1 rounded-full text-xs font-bold">C</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Community</h3>
                <p className="text-gray-600">
                  We're more than a company – we're a community. Our contractors support each other
                  and work as a team to serve their communities.
                </p>
              </div>
            </div>

            {/* Commitment */}
            <div className="bg-gray-50 rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all">
              <div className="relative h-48">
                <Image
                  src="https://3cworldgroup.com/wp-content/uploads/2026/01/1345670580.jpg"
                  alt="Commitment - Professional service"
                  fill
                  className="object-cover"
                />
                <div className="absolute top-4 left-4">
                  <span className="bg-[#0A1F44] text-white px-3 py-1 rounded-full text-xs font-bold">C</span>
                </div>
              </div>
              <div className="p-6">
                <h3 className="text-xl font-bold text-[#0A1F44] mb-3">Commitment</h3>
                <p className="text-gray-600">
                  We're committed to excellence in everything we do – from the quality of services
                  we offer to the training and support we provide.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* What We Do - Gray background */}
      <section className="py-16 md:py-20 bg-gray-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#0A1F44] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              OUR SERVICES
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              What We Do
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              We specialize in B2C sales for telecommunications and home services,
              working with industry-leading providers.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4 border-[#8dc63f]">
              <h3 className="text-xl font-bold text-[#0A1F44] mb-6 flex items-center gap-3">
                <div className="w-12 h-12 bg-[#8dc63f] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                </div>
                For Customers
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#8dc63f] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">High-Speed Fiber Internet</strong>
                    <p className="text-gray-600 text-sm mt-1">Lightning-fast connections for homes and businesses</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#8dc63f] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">Premium TV Services</strong>
                    <p className="text-gray-600 text-sm mt-1">Entertainment packages with hundreds of channels</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#8dc63f] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">Home Security Systems</strong>
                    <p className="text-gray-600 text-sm mt-1">24/7 monitoring and smart home integration</p>
                  </div>
                </li>
              </ul>
            </div>

            <div className="bg-white rounded-2xl p-8 shadow-sm border-l-4 border-[#6A8FE3]">
              <h3 className="text-xl font-bold text-[#0A1F44] mb-6 flex items-center gap-3">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                For Contractors
              </h3>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#6A8FE3] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">Comprehensive Training</strong>
                    <p className="text-gray-600 text-sm mt-1">Sales techniques, product knowledge, and ongoing coaching</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#6A8FE3] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">Protected Territories</strong>
                    <p className="text-gray-600 text-sm mt-1">Dedicated areas with quality lead opportunities</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <svg className="w-5 h-5 text-[#6A8FE3] mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <div>
                    <strong className="text-[#0A1F44]">Technology & Tools</strong>
                    <p className="text-gray-600 text-sm mt-1">CRM, mobile apps, and resources to maximize success</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Contractor Testimonials - White background */}
      <section className="py-16 md:py-20 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <span className="inline-block bg-[#8dc63f] text-white px-4 py-2 rounded-full text-sm font-semibold mb-4">
              SUCCESS STORIES
            </span>
            <h2 className="text-3xl md:text-4xl font-bold text-[#0A1F44] mb-4">
              What Our Contractors Say
            </h2>
            <p className="text-lg text-gray-600 max-w-2xl mx-auto">
              Hear from the sales professionals who have built successful careers with 3C World Group.
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
                "Joining 3C World Group changed my career. I'm earning more than ever and have true flexibility."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">JR</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Jordan R.</div>
                  <div className="text-sm text-gray-500">Sales Contractor</div>
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
                "The support and training are top-notch. I closed my first deal in the first week!"
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#8dc63f] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">MS</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Morgan S.</div>
                  <div className="text-sm text-gray-500">Sales Contractor</div>
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
                "Fast internet, great TV, and peace of mind with security. Highly recommend for home and business."
              </p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-[#6A8FE3] rounded-full flex items-center justify-center">
                  <span className="text-white font-bold">ST</span>
                </div>
                <div>
                  <div className="font-bold text-[#0A1F44]">Samantha T.</div>
                  <div className="text-sm text-gray-500">Small Business Owner</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA - Green accent */}
      <section className="py-16 bg-[#8dc63f]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-white mb-4">
            Join the 3C World Group Family
          </h2>
          <p className="text-xl text-white/90 mb-8">
            Whether you're looking for quality services or an exciting career opportunity, we're here to help.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              href="/apply"
              className="inline-block bg-white text-[#7ab82e] px-8 py-4 rounded-lg font-bold text-lg hover:bg-gray-100 transition-colors shadow-lg"
            >
              Join Our Team
            </Link>
            <Link
              href="/contact"
              className="inline-block border-2 border-white text-white px-8 py-4 rounded-lg font-bold text-lg hover:bg-white/10 transition-colors"
            >
              Contact Us
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}
