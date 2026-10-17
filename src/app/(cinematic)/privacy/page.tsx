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
  alternates: { canonical: "/privacy" },
};

/**
 * Privacy, in the cinematic language: the kit's page head and one paper
 * section set for reading.
 * Amended 2026-10-16 for Google/Apple sign-in, push notifications and
 * self-service account deletion.
 * Amended 2026-10-17 ahead of the 3C Portal App Store submission: onboarding
 * identity and tax data, e-signature records, AI features (sale scan, Ask 3C,
 * Practice), microphone and speech, photos and chat, Face ID, named service
 * providers, and retention. Each statement was checked against the portal
 * code on master; open questions are marked TODO(Jacob).
 */
const LAST_UPDATED = "October 17, 2026";

export default function PrivacyPolicyPage() {
  return (
    <>
      <header className={kit.pageHeadFlat}>
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>Legal</p>
              <h1 className={kit.pageHeadTitle}>Privacy Policy</h1>
            </div>
            <div>
              <p className={kit.pageHeadLedeFlat}>
                We respect your privacy and are committed to protecting your personal information.
                This policy explains what we collect, how we use it, and the choices you have.
              </p>
              <p className={styles.effective}>Last updated: {LAST_UPDATED}</p>
            </div>
          </div>
        </div>
      </header>

      <section className={`${kit.surfacePaper} ${kit.seamTopOnly} ${styles.body}`} aria-label="Privacy Policy">
        <div className={kit.shell}>
          <div className={styles.prose}>
            <LegalSection id="privacy-1" title="1. Introduction">
              <p>
                3C World Group (&ldquo;<strong>3C World Group</strong>,&rdquo; &ldquo;<strong>we</strong>,&rdquo;
                &ldquo;<strong>us</strong>,&rdquo; or &ldquo;<strong>our</strong>&rdquo;) operates this website, the
                associated contractor portal, and the 3C Portal iPhone app, which opens the same portal.
                This Privacy Policy describes how we collect, use, share, and protect personal
                information when you visit our website, submit a contractor application, contact us, or
                use our sales portal on the web or in the app.
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
                  <strong>Contractor onboarding information.</strong> When you join as a contractor, we
                  collect what we need for tax, payment, and background-check paperwork: your Social
                  Security Number, driver&apos;s license number, a photo of your driver&apos;s license,
                  your background-check authorization, tax form details (such as your legal or business
                  name and tax classification), and the bank name, routing number, and account number you
                  enter on the direct-deposit form. Your Social Security Number and driver&apos;s license
                  number are stored encrypted, only a small number of authorized staff can view them,
                  and each time they are viewed it is logged.
                </li>
                <li>
                  <strong>Electronic signatures.</strong> When you sign a document in the portal, we keep
                  the signed document with a record of the signing: the time, your IP address, and your
                  browser or device type (user agent).
                </li>
                <li>
                  <strong>Account and portal activity.</strong> Login credentials, sales records and the
                  details you enter about each sale, training progress, leaderboard activity, when you
                  were last active in the portal, and other data generated as you use the contractor
                  portal.
                </li>
                <li>
                  <strong>Photos and files.</strong> Photos and screenshots you upload or take with your
                  camera, such as sale confirmation screenshots, your profile photo, onboarding documents,
                  and images and PDFs you attach in team chat.
                </li>
                <li>
                  <strong>Messages.</strong> Messages, reactions, and attachments you send in the
                  portal&apos;s team chat, and questions you ask Ask 3C (see AI Features below).
                </li>
                <li>
                  <strong>Voice.</strong> If you use voice sales practice, the app uses your microphone to
                  hear what you say and turn it into text. See AI Features below for how this works.
                  The app only uses the microphone while you are practicing and after you allow it.
                </li>
                <li>
                  <strong>Sign-in and device information.</strong> If you sign in with Google or Apple, the
                  account identifier and email address that provider shares with us (Apple may share a
                  private relay address instead of your own). If you turn on notifications in the portal
                  or the 3C Portal iPhone app, a push token that lets us send notifications to that
                  device, along with basic information about whether notifications are reaching it
                  (such as the notification permission and browser or device type).
                </li>
                <li>
                  <strong>Face ID.</strong> The 3C Portal app can ask for Face ID before it opens. Face ID is
                  handled entirely by your iPhone. We never receive your face data or any other biometric
                  information; the app only learns whether the check passed.
                </li>
                <li>
                  <strong>Automatically collected information.</strong> IP address, browser type, device
                  type, pages visited, referring URL, and similar usage data collected through cookies
                  and standard web analytics.
                </li>
              </ul>
              <p>We do not collect your precise location, and we do not read your contacts.</p>
            </LegalSection>

            <LegalSection id="privacy-3" title="3. How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul>
                <li>Review and process contractor applications.</li>
                <li>
                  Onboard contractors, including tax reporting, direct-deposit setup, background checks,
                  and signed contractor agreements.
                </li>
                <li>
                  Operate and improve our contractor portal, including sales tracking, payroll and pay
                  estimates, reconciling sales with the carriers we sell for, training, and team chat.
                </li>
                <li>Respond to inquiries submitted through our contact form.</li>
                <li>Communicate about opportunities, schedules, payments, and account matters.</li>
                <li>Send portal notifications, such as messages and form activity, to devices where you turned them on.</li>
                <li>Maintain security, prevent fraud and spam sign-ups, and comply with legal obligations.</li>
                <li>Analyze website usage to improve content, performance, and user experience.</li>
              </ul>
              <p>We do not use your information for advertising, and we do not track you across other companies&apos; apps or websites.</p>
            </LegalSection>

            <LegalSection id="privacy-4" title="4. AI Features">
              <p>
                Some portal features use artificial intelligence services from other companies. We send
                them only what the feature needs, and only when you use the feature.
              </p>
              <ul>
                <li>
                  <strong>Sale screenshot auto-fill.</strong> When you log a sale, you can have the portal
                  read your sale confirmation screenshot and fill in the form for you. The screenshot is
                  sent to Google&apos;s Gemini service to read it. You review every field before you
                  submit. The screenshot itself is saved with your sale as proof of the order.
                </li>
                <li>
                  <strong>Ask 3C.</strong> Ask 3C answers questions about the portal and selling. Your
                  question, the earlier messages in that conversation, any photo you attach, and some
                  portal information about you (your first name, city and state, dealer codes, and a
                  summary of your recent sales) are sent to an AI provider to write the answer. Email addresses and phone numbers you type are removed before your
                  question is sent or saved. We keep a record of each question and answer so we can
                  improve Ask 3C. Photos you attach are not saved.
                  {/* TODO(Jacob): name the Ask 3C provider. The code defaults to DeepSeek
                      (api.deepseek.com, src/lib/ask/provider.ts) unless ASK_BASE_URL points elsewhere
                      in Vercel. If prod uses DeepSeek, add it here and in section 6, and decide
                      whether a provider that processes data in China is acceptable before launch. */}
                </li>
                <li>
                  <strong>Voice sales practice.</strong> Practice lets you rehearse a door conversation
                  with an AI homeowner. In hands-free mode, your microphone audio is streamed to
                  Google&apos;s Gemini service to turn your speech into text, and the homeowner&apos;s
                  replies are spoken using Google&apos;s Gemini text-to-speech. Otherwise, your speech is
                  turned into text by your phone or browser&apos;s built-in speech recognition (on
                  iPhone, provided by Apple). The text of your practice conversation is sent to our AI
                  provider to write the homeowner&apos;s replies and your coaching feedback, and we keep a
                  record of each finished practice session and its feedback. We do not save recordings
                  of your voice.
                </li>
              </ul>
              {/* TODO(Jacob): confirm the Gemini API key is on a paid (billed) Google Cloud project.
                  Only paid-tier Gemini API data is excluded from Google's model training; if it is,
                  we can add: "Google does not use this data to train its models." */}
            </LegalSection>

            <LegalSection id="privacy-5" title="5. Team Chat">
              <p>
                Messages, reactions, and attachments you send in team chat are stored with your name and
                can be seen by the other members of that channel. You can delete your
                own messages. Portal administrators with chat moderation access can delete any message.
              </p>
              <p>
                GIFs in chat come from GIPHY. When you search for a GIF, the search goes through our
                servers, but the GIFs themselves load directly from GIPHY, which can see your IP address
                and device information when they do.
              </p>
              {/* TODO(Jacob): chat reporting and blocking are not on master yet (no report/block code
                  found 2026-10-17). Uncomment and adjust this paragraph once that ships, and before
                  App Store submission:
              <p>
                You can report a message or a person, and you can block someone so you no longer see
                their messages. Reports go to 3C World Group administrators, who review them and may
                remove content or suspend accounts that break our rules. When you report something,
                we keep the report, the reported content, and who sent it.
              </p>
              */}
            </LegalSection>

            <LegalSection id="privacy-6" title="6. How We Share Your Information">
              <p>
                We do not sell your personal information. We may share information in the following
                limited circumstances:
              </p>
              <ul>
                <li>
                  <strong>Service providers.</strong> With vendors who help us operate our website and
                  portal, bound by appropriate confidentiality and data-protection obligations. These
                  include:
                  <ul>
                    <li>Google Firebase and Google Cloud, for sign-in, our database, file storage, and push notifications.</li>
                    <li>Vercel, which hosts our website and portal and provides our cookieless page analytics.</li>
                    <li>Postmark, which sends our email.</li>
                    <li>Google Gemini, for the AI features described above.</li>
                    <li>Google reCAPTCHA, which helps block automated sign-ups.</li>
                    <li>Google Workspace, where we keep a copy of contractor applications.</li>
                    <li>GIPHY, for GIFs in team chat.</li>
                    <li>Apple and Google, if you choose to sign in with them, and Apple for delivering notifications to iPhones.</li>
                  </ul>
                </li>
                <li>
                  <strong>Within 3C World Group.</strong> Your managers and authorized staff see the
                  portal information they need to do their jobs, such as your sales records and onboarding
                  status. Your name and sales results may appear on team leaderboards that other portal
                  users can see.
                </li>
                <li>
                  <strong>Carriers.</strong> Sales information needed to confirm and reconcile the orders
                  you sell with the carriers we sell for.
                  {/* TODO(Jacob): confirm what, if anything, 3C sends to carriers about a rep (name, rep
                      ID, order details). The portal code receives carrier reports; I found no code that
                      sends rep data to carriers. Delete this bullet if nothing is shared. */}
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

            <LegalSection id="privacy-7" title="7. Cookies and Analytics">
              <p>
                We use cookies and similar technologies to keep you signed in to the portal, remember
                preferences, and understand how visitors use our site. You can control cookies through
                your browser settings. Disabling cookies may limit some functionality of the portal.
                Our public pages use cookieless page analytics, and when you submit a contractor
                application we record how you found our website, such as the referring site or campaign.
                The portal and the 3C Portal app do not use advertising or third-party analytics tools.
              </p>
            </LegalSection>

            <LegalSection id="privacy-8" title="8. Data Security">
              <p>
                We use reasonable administrative, technical, and physical safeguards to protect your
                information, including encrypted connections, access controls on portal data, and
                additional encryption for Social Security and driver&apos;s license numbers. However, no
                method of transmission or storage is 100% secure, and we cannot guarantee absolute
                security.
              </p>
            </LegalSection>

            <LegalSection id="privacy-9" title="9. Data Retention and Account Deletion">
              <p>
                We retain personal information for as long as needed to provide our services, comply
                with legal obligations, resolve disputes, and enforce agreements. When information is
                no longer needed, we take steps to securely delete or anonymize it.
                {/* TODO(Jacob): no automatic retention periods exist in the code. If you want stated
                    periods (for example, "applications we do not act on are deleted after N months",
                    or how long Ask 3C and Practice records are kept), give them and we will add them. */}
              </p>
              <p>
                <strong>Deleting your portal account.</strong> You can delete your portal account at any
                time in the 3C Portal iPhone app under Settings &gt; Delete account, or by asking us
                (see Contact Us below). If your sign-up is still waiting for approval, you can delete
                the request from that screen. When your account is deleted, we close your sign-in and
                remove your personal profile details (contact information, address, profile photo),
                your Social Security and driver&apos;s license numbers and license photos, and your
                notification devices. Your profile and the chat messages you sent show as &ldquo;Deleted
                user.&rdquo;
              </p>
              <p>
                Some records are kept after deletion because we need them for business and legal
                reasons: your sales, commission, and pay records, including the sale screenshots
                attached to them, which we must keep for payroll, tax, and carrier reconciliation;
                signed contractor paperwork, such as tax and direct-deposit forms and contractor
                agreements; and a log of who viewed your identity information. Records of your Ask 3C
                questions and practice sessions are also kept.
                {/* TODO(Jacob): the self-delete route does not remove askLog or practiceLog rows, or the
                    message text itself (only the author name is replaced). Confirm that is intended, or
                    we add those to the deletion. */}
              </p>
            </LegalSection>

            <LegalSection id="privacy-10" title="10. Your Rights and Choices">
              <p>Depending on where you live, you may have the right to:</p>
              <ul>
                <li>Access the personal information we hold about you.</li>
                <li>Request correction of inaccurate information.</li>
                <li>
                  Request deletion of your information, subject to legal exceptions. Portal users can
                  delete their account in the 3C Portal iPhone app under Settings, or by asking us
                  (see Data Retention and Account Deletion above).
                </li>
                <li>Opt out of marketing communications at any time.</li>
              </ul>
              <p>
                You can also turn off notifications, microphone, camera, photo, and Face ID access at any
                time in your iPhone&apos;s Settings. Some features, such as voice practice, will not work
                without them.
              </p>
              <p>
                To exercise any of these rights, email us or use the contact form listed under{" "}
                <a href="#privacy-14" className={kit.inlineLink}>
                  Contact Us
                </a>{" "}
                below. We may need to verify your identity before fulfilling a request.
              </p>
            </LegalSection>

            <LegalSection id="privacy-11" title="11. Children's Privacy">
              <p>
                Our website and services are not directed to children under 16, and we do not knowingly
                collect personal information from children. If you believe a child has provided us with
                personal information, please contact us so we can delete it.
                {/* TODO(Jacob): contractors are presumably 18+. If so, consider "not directed to anyone
                    under 18" to match the App Store age rating you choose. */}
              </p>
            </LegalSection>

            <LegalSection id="privacy-12" title="12. Third-Party Links">
              <p>
                Our site may contain links to third-party websites that we do not control. This Privacy
                Policy does not apply to those sites, and we encourage you to read their privacy
                policies before providing any information.
              </p>
            </LegalSection>

            <LegalSection id="privacy-13" title="13. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Material changes will be
                communicated through the website or by email where appropriate.
              </p>
            </LegalSection>

            <LegalSection id="privacy-14" title="14. Contact Us">
              <p>
                If you have questions about this Privacy Policy or how we handle your information,
                please reach out:
              </p>
              {/* TODO(Jacob): confirm privacy@3cworldgroup.com is a real, monitored inbox before
                  submission; Apple reviewers and users will use it for deletion requests. */}
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
