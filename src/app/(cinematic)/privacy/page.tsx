import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import kit from "../../_cinematic/cinematic.module.css";
import LegalSection from "../_legal/LegalSection";
import styles from "../_legal/legal.module.css";

export const metadata: Metadata = {
  title: "Privacy Policy | 3C World Group",
  description:
    "How 3C World Group collects, uses, and protects your personal information across our website, contractor applications, and sales portal.",
};

/**
 * Privacy, in the cinematic language. The policy text is carried over from the
 * page it replaces word for word — every clause, in its original order, with
 * its original numbering. Only the presentation changed: the kit's page head
 * instead of the old gradient hero, and one paper section set for reading.
 */
const LAST_UPDATED = "May 6, 2026";

export default function PrivacyPolicyPage() {
  return (
    <>
      <header className={kit.pageHead}>
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>Legal</p>
              <h1 className={kit.pageHeadTitle}>Privacy Policy</h1>
            </div>
            <div>
              <p className={kit.pageHeadLede}>
                We respect your privacy and are committed to protecting your personal information.
                This policy explains what we collect, how we use it, and the choices you have.
              </p>
              <p className={styles.effective}>Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </div>
      </header>

      <section className={`${kit.surfacePaper} ${kit.seam} ${styles.body}`} aria-label="Privacy Policy">
        <div className={kit.shell}>
          <div className={styles.prose}>
            <LegalSection id="privacy-1" title="1. Introduction">
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
            </LegalSection>

            <LegalSection id="privacy-2" title="2. Information We Collect">
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
            </LegalSection>

            <LegalSection id="privacy-3" title="3. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Review and process contractor applications.</li>
                <li>Operate and improve our contractor portal, including sales tracking and training.</li>
                <li>Respond to inquiries submitted through our contact form.</li>
                <li>Communicate about opportunities, schedules, payments, and account matters.</li>
                <li>Maintain security, prevent fraud, and comply with legal obligations.</li>
                <li>Analyze website usage to improve content, performance, and user experience.</li>
              </ul>
            </LegalSection>

            <LegalSection id="privacy-4" title="4. How We Share Your Information">
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
            </LegalSection>

            <LegalSection id="privacy-5" title="5. Cookies and Analytics">
              <p>
                We use cookies and similar technologies to keep you signed in to the portal, remember
                preferences, and understand how visitors use our site. You can control cookies through
                your browser settings. Disabling cookies may limit some functionality of the portal.
              </p>
            </LegalSection>

            <LegalSection id="privacy-6" title="6. Data Security">
              <p>
                We use reasonable administrative, technical, and physical safeguards to protect your
                information, including encrypted connections and access controls on portal data.
                However, no method of transmission or storage is 100% secure, and we cannot guarantee
                absolute security.
              </p>
            </LegalSection>

            <LegalSection id="privacy-7" title="7. Data Retention">
              <p>
                We retain personal information for as long as needed to provide our services, comply
                with legal obligations, resolve disputes, and enforce agreements. When information is
                no longer needed, we take steps to securely delete or anonymize it.
              </p>
            </LegalSection>

            <LegalSection id="privacy-8" title="8. Your Rights and Choices">
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
            </LegalSection>

            <LegalSection id="privacy-9" title="9. Children's Privacy">
              <p>
                Our website and services are not directed to children under 16, and we do not knowingly
                collect personal information from children. If you believe a child has provided us with
                personal information, please contact us so we can delete it.
              </p>
            </LegalSection>

            <LegalSection id="privacy-10" title="10. Third-Party Links">
              <p>
                Our site may contain links to third-party websites that we do not control. This Privacy
                Policy does not apply to those sites, and we encourage you to read their privacy
                policies before providing any information.
              </p>
            </LegalSection>

            <LegalSection id="privacy-11" title="11. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Material changes will be
                communicated through the website or by email where appropriate.
              </p>
            </LegalSection>

            <LegalSection id="privacy-12" title="12. Contact Us">
              <p>
                If you have questions about this Privacy Policy or how we handle your information,
                please reach out:
              </p>
              <ul>
                <li>
                  <strong>Email:</strong>{" "}
                  <a href="mailto:privacy@3cworldgroup.com" className={kit.inlineLink}>
                    privacy@3cworldgroup.com
                  </a>
                </li>
                <li>
                  <strong>Contact form:</strong>{" "}
                  <Link href="/contact" className={kit.inlineLink}>
                    3cworldgroup.com/contact
                  </Link>
                </li>
              </ul>
            </LegalSection>
          </div>

          <div className={styles.close}>
            <p>Have questions? We&apos;re here to help.</p>
            <Link href="/contact" className={`${kit.btn} ${kit.btnLime}`}>
              Contact Us
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
