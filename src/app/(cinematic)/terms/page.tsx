import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import kit from "../../_cinematic/cinematic.module.css";
import LegalSection from "../_legal/LegalSection";
import styles from "../_legal/legal.module.css";

export const metadata: Metadata = {
  title: "Terms of Service | 3C World Group",
  description:
    "The terms and conditions that govern your use of the 3C World Group website, contractor portal, and related services.",
};

/**
 * Terms, in the cinematic language. As with /privacy, every clause is carried
 * over from the page it replaces word for word, in its original order and
 * numbering — including the capitalised disclaimer and liability clauses, which
 * are set in the same body type rather than shrunk into fine print.
 */
const LAST_UPDATED = "May 6, 2026";

export default function TermsOfServicePage() {
  return (
    <>
      <header className={kit.pageHead}>
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>Legal</p>
              <h1 className={kit.pageHeadTitle}>Terms of Service</h1>
            </div>
            <div>
              <p className={kit.pageHeadLede}>
                Please read these Terms carefully. By using our website or contractor portal, you agree
                to be bound by them.
              </p>
              <p className={styles.effective}>Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </div>
      </header>

      <section className={`${kit.surfacePaper} ${kit.seam} ${styles.body}`} aria-label="Terms of Service">
        <div className={kit.shell}>
          <div className={styles.prose}>
            <LegalSection id="terms-1" title="1. Acceptance of Terms">
              <p>
                These Terms of Service (&ldquo;<strong>Terms</strong>&rdquo;) govern your access to and
                use of the 3C World Group website, contractor portal, and any related services
                (collectively, the &ldquo;<strong>Services</strong>&rdquo;). By accessing or using the
                Services, you agree to these Terms. If you do not agree, do not use the Services.
              </p>
            </LegalSection>

            <LegalSection id="terms-2" title="2. Eligibility">
              <p>
                You must be at least 18 years old and legally able to enter into a binding contract to
                use the Services. By using the Services, you represent that you meet these
                requirements.
              </p>
            </LegalSection>

            <LegalSection id="terms-3" title="3. Accounts and Security">
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
            </LegalSection>

            <LegalSection id="terms-4" title="4. Independent Contractor Relationship">
              <p>
                Nothing in these Terms creates an employer-employee, partnership, or joint-venture
                relationship between you and 3C World Group. Contractors who work with us do so
                under separate independent contractor agreements that govern compensation, scope,
                and obligations.
              </p>
            </LegalSection>

            <LegalSection id="terms-5" title="5. Acceptable Use">
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
            </LegalSection>

            <LegalSection id="terms-6" title="6. Intellectual Property">
              <p>
                The Services, including text, graphics, logos, and software, are owned by 3C World
                Group or its licensors and are protected by intellectual property laws. You are
                granted a limited, non-exclusive, non-transferable license to use the Services for
                their intended purpose. You may not copy, modify, distribute, or create derivative
                works without our written permission.
              </p>
            </LegalSection>

            <LegalSection id="terms-7" title="7. Submissions and Applications">
              <p>
                If you submit a contractor application, contact form, or other content, you represent
                that the information you provide is accurate and that you have the right to share it.
                We may use submitted information to evaluate applications, respond to inquiries, and
                operate the Services as described in our{" "}
                <Link href="/privacy" className={kit.inlineLink}>
                  Privacy Policy
                </Link>
                .
              </p>
            </LegalSection>

            <LegalSection id="terms-8" title="8. Third-Party Services and Links">
              <p>
                The Services may contain links to or integrations with third-party websites and
                services. We are not responsible for the content, policies, or practices of those
                third parties. Your use of any third-party service is subject to that party&apos;s
                terms.
              </p>
            </LegalSection>

            <LegalSection id="terms-9" title="9. Disclaimers">
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
            </LegalSection>

            <LegalSection id="terms-10" title="10. Limitation of Liability">
              <p>
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, 3C WORLD GROUP AND ITS AFFILIATES, OFFICERS,
                EMPLOYEES, AND AGENTS WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
                CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, REVENUE, OR DATA, ARISING
                OUT OF OR RELATING TO YOUR USE OF THE SERVICES.
              </p>
            </LegalSection>

            <LegalSection id="terms-11" title="11. Indemnification">
              <p>
                You agree to indemnify and hold harmless 3C World Group from any claims, damages,
                losses, or expenses (including reasonable attorneys&apos; fees) arising from your use
                of the Services, your violation of these Terms, or your violation of any rights of
                another party.
              </p>
            </LegalSection>

            <LegalSection id="terms-12" title="12. Termination">
              <p>
                We may suspend or terminate your access to the Services at any time, with or without
                notice, for any reason, including violation of these Terms. Provisions that by their
                nature should survive termination (such as intellectual property, disclaimers, and
                limitations of liability) will continue to apply.
              </p>
            </LegalSection>

            <LegalSection id="terms-13" title="13. Governing Law">
              <p>
                These Terms are governed by the laws of the State of California and the United
                States, without regard to conflict-of-laws principles. You agree to the exclusive
                jurisdiction of the state and federal courts located in California for any dispute
                arising out of these Terms.
              </p>
            </LegalSection>

            <LegalSection id="terms-14" title="14. Changes to These Terms">
              <p>
                We may update these Terms from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Continued use of the Services
                after changes take effect constitutes acceptance of the updated Terms.
              </p>
            </LegalSection>

            <LegalSection id="terms-15" title="15. Contact Us">
              <p>If you have questions about these Terms, please reach out:</p>
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
            <p>
              See also our{" "}
              <Link href="/privacy" className={kit.inlineLink}>
                Privacy Policy
              </Link>
              .
            </p>
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
