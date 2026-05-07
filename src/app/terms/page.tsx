import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "Terms of Service | 3C World Group",
  description:
    "The terms and conditions that govern your use of the 3C World Group website, contractor portal, and related services.",
};

const LAST_UPDATED = "May 6, 2026";

export default function TermsOfServicePage() {
  return (
    <PageWrapper>
      {/* Hero */}
      <section className="bg-[#0A1F44] text-white py-20 md:py-28 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-full bg-gradient-to-l from-[#6A8FE3]/20 to-transparent" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="inline-block bg-[#8dc63f] text-white px-5 py-2 font-bold text-sm uppercase tracking-wider mb-6">
            Legal
          </div>
          <h1 className="text-5xl md:text-6xl font-black mb-6 leading-[1.1]">
            Terms of Service
          </h1>
          <p className="text-lg text-white/80 max-w-2xl">
            Please read these Terms carefully. By using our website or contractor portal, you agree
            to be bound by them.
          </p>
          <p className="mt-6 text-sm text-white/60 uppercase tracking-wider font-semibold">
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* Content */}
      <section className="bg-white py-16 md:py-24">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="prose prose-lg max-w-none">
            <PolicySection title="1. Acceptance of Terms">
              <p>
                These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your access to and
                use of the 3C World Group website, contractor portal, and any related services
                (collectively, the &ldquo;<strong>Services</strong>&rdquo;). By accessing or using the
                Services, you agree to these Terms. If you do not agree, do not use the Services.
              </p>
            </PolicySection>

            <PolicySection title="2. Eligibility">
              <p>
                You must be at least 18 years old and legally able to enter into a binding contract to
                use the Services. By using the Services, you represent that you meet these
                requirements.
              </p>
            </PolicySection>

            <PolicySection title="3. Accounts and Security">
              <p>
                Some areas of the Services, including the contractor portal, require an account. You
                are responsible for:
              </p>
              <ul>
                <li>Providing accurate and complete information during registration.</li>
                <li>Keeping your login credentials confidential.</li>
                <li>All activity that occurs under your account.</li>
              </ul>
              <p>
                Notify us immediately if you suspect unauthorized access to your account.
              </p>
            </PolicySection>

            <PolicySection title="4. Independent Contractor Relationship">
              <p>
                Nothing in these Terms creates an employer-employee, partnership, or joint-venture
                relationship between you and 3C World Group. Contractors who work with us do so
                under separate independent contractor agreements that govern compensation, scope,
                and obligations.
              </p>
            </PolicySection>

            <PolicySection title="5. Acceptable Use">
              <p>You agree not to:</p>
              <ul>
                <li>Use the Services for any unlawful or fraudulent purpose.</li>
                <li>Misrepresent your identity or affiliation.</li>
                <li>
                  Upload, transmit, or share content that is harmful, defamatory, or infringes on
                  another person&apos;s rights.
                </li>
                <li>
                  Attempt to gain unauthorized access to the Services or interfere with their
                  operation, security, or availability.
                </li>
                <li>
                  Use automated tools (bots, scrapers, etc.) to access the Services without our
                  written consent.
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="6. Intellectual Property">
              <p>
                The Services, including text, graphics, logos, and software, are owned by 3C World
                Group or its licensors and are protected by intellectual property laws. You are
                granted a limited, non-exclusive, non-transferable license to use the Services for
                their intended purpose. You may not copy, modify, distribute, or create derivative
                works without our written permission.
              </p>
            </PolicySection>

            <PolicySection title="7. Submissions and Applications">
              <p>
                If you submit a contractor application, contact form, or other content, you represent
                that the information you provide is accurate and that you have the right to share it.
                We may use submitted information to evaluate applications, respond to inquiries, and
                operate the Services as described in our{" "}
                <Link href="/privacy" className="text-[#0A1F44] font-semibold hover:text-[#8dc63f]">
                  Privacy Policy
                </Link>
                .
              </p>
            </PolicySection>

            <PolicySection title="8. Third-Party Services and Links">
              <p>
                The Services may contain links to or integrations with third-party websites and
                services. We are not responsible for the content, policies, or practices of those
                third parties. Your use of any third-party service is subject to that party&apos;s
                terms.
              </p>
            </PolicySection>

            <PolicySection title="9. Disclaimers">
              <p>
                THE SERVICES ARE PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT
                WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY,
                FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE
                SERVICES WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
              </p>
              <p>
                Earnings statements or projections shown anywhere on the Services represent potential
                results based on past contractor performance and are not a guarantee of income.
                Individual results vary.
              </p>
            </PolicySection>

            <PolicySection title="10. Limitation of Liability">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, 3C WORLD GROUP AND ITS AFFILIATES, OFFICERS,
                EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, OR DATA, ARISING
                OUT OF OR RELATING TO YOUR USE OF THE SERVICES.
              </p>
            </PolicySection>

            <PolicySection title="11. Indemnification">
              <p>
                You agree to indemnify and hold harmless 3C World Group from any claims, damages,
                losses, or expenses (including reasonable attorneys&apos; fees) arising from your use
                of the Services, your violation of these Terms, or your violation of any rights of
                another party.
              </p>
            </PolicySection>

            <PolicySection title="12. Termination">
              <p>
                We may suspend or terminate your access to the Services at any time, with or without
                notice, for any reason, including violation of these Terms. Provisions that by their
                nature should survive termination (such as intellectual property, disclaimers, and
                limitations of liability) will continue to apply.
              </p>
            </PolicySection>

            <PolicySection title="13. Governing Law">
              <p>
                These Terms are governed by the laws of the State of California and the United
                States, without regard to conflict-of-laws principles. You agree to the exclusive
                jurisdiction of the state and federal courts located in California for any dispute
                arising out of these Terms.
              </p>
            </PolicySection>

            <PolicySection title="14. Changes to These Terms">
              <p>
                We may update these Terms from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the Services
                after changes take effect constitutes acceptance of the updated Terms.
              </p>
            </PolicySection>

            <PolicySection title="15. Contact Us">
              <p>If you have questions about these Terms, please reach out:</p>
              <ul>
                <li>
                  <strong>Email:</strong>{" "}
                  <a
                    href="mailto:privacy@3cworldgroup.com"
                    className="text-[#0A1F44] font-semibold hover:text-[#8dc63f]"
                  >
                    privacy@3cworldgroup.com
                  </a>
                </li>
                <li>
                  <strong>Contact form:</strong>{" "}
                  <Link
                    href="/contact"
                    className="text-[#0A1F44] font-semibold hover:text-[#8dc63f]"
                  >
                    3cworldgroup.com/contact
                  </Link>
                </li>
              </ul>
            </PolicySection>
          </div>

          {/* Back to home CTA */}
          <div className="mt-16 pt-8 border-t border-gray-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <p className="text-gray-600 text-sm">
              See also our{" "}
              <Link href="/privacy" className="text-[#0A1F44] font-semibold hover:text-[#8dc63f]">
                Privacy Policy
              </Link>
              .
            </p>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 bg-[#8dc63f] hover:bg-[#7ab234] text-white font-bold px-6 py-3 transition-colors"
            >
              Contact Us
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
        </div>
      </section>
    </PageWrapper>
  );
}

function PolicySection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-10">
      <h2 className="text-2xl md:text-3xl font-black text-[#0A1F44] mb-4">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-4">{children}</div>
    </div>
  );
}
