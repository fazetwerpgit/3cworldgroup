import Link from "next/link";
import PageWrapper from "@/components/PageWrapper";

export const metadata = {
  title: "Privacy Policy | 3C World Group",
  description:
    "How 3C World Group collects, uses, and protects your personal information across our website, contractor applications, and sales portal.",
};

const LAST_UPDATED = "May 6, 2026";

export default function PrivacyPolicyPage() {
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
            Privacy Policy
          </h1>
          <p className="text-lg text-white/80 max-w-2xl">
            We respect your privacy and are committed to protecting your personal information.
            This policy explains what we collect, how we use it, and the choices you have.
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
            <PolicySection title="1. Introduction">
              <p>
                3C World Group (&ldquo;<strong>3C World Group</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo;
                &ldquo;<strong>us</strong>,&rdquo; or &ldquo;<strong>our</strong>&rdquo;) operates this website and the
                associated contractor portal. This Privacy Policy describes how we collect, use, share,
                and protect personal information when you visit our website, submit a contractor
                application, contact us, or use our sales portal.
              </p>
              <p>
                By using our website or services, you agree to the collection and use of information in
                accordance with this policy.
              </p>
            </PolicySection>

            <PolicySection title="2. Information We Collect">
              <p>We collect the following categories of information:</p>
              <ul>
                <li>
                  <strong>Information you provide directly.</strong> Name, email address, phone number,
                  mailing address, work history, and other details you submit through our contractor
                  application, contact form, or when creating a portal account.
                </li>
                <li>
                  <strong>Account and portal activity.</strong> Login credentials, sales records,
                  training progress, leaderboard activity, and other data generated as you use the
                  contractor portal.
                </li>
                <li>
                  <strong>Automatically collected information.</strong> IP address, browser type, device
                  type, pages visited, referring URL, and similar usage data collected through cookies
                  and standard web analytics.
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="3. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Review and process contractor applications.</li>
                <li>Operate and improve our contractor portal, including sales tracking and training.</li>
                <li>Respond to inquiries submitted through our contact form.</li>
                <li>Communicate about opportunities, schedules, payments, and account matters.</li>
                <li>Maintain security, prevent fraud, and comply with legal obligations.</li>
                <li>Analyze website usage to improve content, performance, and user experience.</li>
              </ul>
            </PolicySection>

            <PolicySection title="4. How We Share Your Information">
              <p>
                We do not sell your personal information. We may share information in the following
                limited circumstances:
              </p>
              <ul>
                <li>
                  <strong>Service providers.</strong> With vendors who help us operate our website and
                  portal (such as hosting, authentication, email, and analytics providers), bound by
                  appropriate confidentiality and data-protection obligations.
                </li>
                <li>
                  <strong>Legal compliance.</strong> When required by law, subpoena, or other legal
                  process, or to protect the rights, property, or safety of 3C World Group, our
                  contractors, or others.
                </li>
                <li>
                  <strong>Business transfers.</strong> In connection with a merger, acquisition,
                  financing, or sale of assets, in which case information may be transferred as part
                  of that transaction.
                </li>
              </ul>
            </PolicySection>

            <PolicySection title="5. Cookies and Analytics">
              <p>
                We use cookies and similar technologies to keep you signed in to the portal, remember
                preferences, and understand how visitors use our site. You can control cookies through
                your browser settings. Disabling cookies may limit some functionality of the portal.
              </p>
            </PolicySection>

            <PolicySection title="6. Data Security">
              <p>
                We use reasonable administrative, technical, and physical safeguards to protect your
                information, including encrypted connections and access controls on portal data.
                However, no method of transmission or storage is 100% secure, and we cannot guarantee
                absolute security.
              </p>
            </PolicySection>

            <PolicySection title="7. Data Retention">
              <p>
                We retain personal information for as long as needed to provide our services, comply
                with legal obligations, resolve disputes, and enforce agreements. When information is
                no longer needed, we take steps to securely delete or anonymize it.
              </p>
            </PolicySection>

            <PolicySection title="8. Your Rights and Choices">
              <p>Depending on where you live, you may have the right to:</p>
              <ul>
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate information.</li>
                <li>Request deletion of your information, subject to legal exceptions.</li>
                <li>Opt out of marketing communications at any time.</li>
              </ul>
              <p>
                To exercise any of these rights, contact us at the address below. We may need to verify
                your identity before fulfilling a request.
              </p>
            </PolicySection>

            <PolicySection title="9. Children's Privacy">
              <p>
                Our website and services are not directed to children under 16, and we do not knowingly
                collect personal information from children. If you believe a child has provided us with
                personal information, please contact us so we can delete it.
              </p>
            </PolicySection>

            <PolicySection title="10. Third-Party Links">
              <p>
                Our site may contain links to third-party websites that we do not control. This Privacy
                Policy does not apply to those sites, and we encourage you to read their privacy
                policies before providing any information.
              </p>
            </PolicySection>

            <PolicySection title="11. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Material changes will be
                communicated through the website or by email where appropriate.
              </p>
            </PolicySection>

            <PolicySection title="12. Contact Us">
              <p>
                If you have questions about this Privacy Policy or how we handle your information,
                please reach out:
              </p>
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
              Have questions? We&apos;re here to help.
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
