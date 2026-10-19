import type { Metadata } from "next";
import kit from "../../_cinematic/cinematic.module.css";
import LegalSection from "../_legal/LegalSection";
import { LegalContactButton, LegalContactFormItem } from "../_legal/LegalContact";
import AppLegalBar from "../../_cinematic/AppLegalBar";
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
 * code on master; open questions were resolved with the owner.
 * Amended 2026-10-17 with the owner's answers: DeepSeek named, Gemini on a
 * paid plan, no carrier sharing, a stated retention period, anonymized
 * Ask/Practice history after self-deletion, and a minimum age of 18.
 * Amended 2026-10-18 to match the code: Ask 3C no longer sends customer or
 * teammate names; the one-time AI consent sheet; signed W-9 and direct-deposit
 * PDFs are emailed to the owners and can be viewed and exported by them;
 * customer information from sales; support forms; analytics on public pages
 * only.
 * Amended 2026-10-18 (owner decision): tax and banking documents and numbers
 * (W-9, SSN, direct deposit) are visible to the owners only, not administrators.
 */
const LAST_UPDATED = "October 18, 2026";

export default function PrivacyPolicyPage() {
  return (
    <>
      {/* In the 3C iOS app: a back bar to the portal instead of the site header. */}
      <AppLegalBar />
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
                  enter on the direct-deposit form. Bank details are used only to pay you. Your Social
                  Security Number and driver&apos;s license number are stored encrypted in our database.
                  Your signed W-9 (which shows your full Social Security Number) and your signed
                  direct-deposit form are saved as PDFs in our secure file storage, and a copy is emailed
                  to 3C&apos;s owners when you finish onboarding. In the portal, only 3C&apos;s owners
                  can open your tax and banking documents and numbers: your W-9, your Social Security
                  Number, and your direct-deposit form. The owners and a small number of administrators
                  can open your driver&apos;s license number and photo, and the owners can view and
                  export all of it. We log each time someone opens them in the portal; copies sent by
                  email are not tracked.
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
                  camera, such as sale confirmation screenshots, onboarding documents, and images and PDFs
                  you attach in team chat. If you sign in with Google, we also show your Google profile
                  photo.
                </li>
                <li>
                  <strong>Messages.</strong> Messages, reactions, and attachments you send in the
                  portal&apos;s team chat, and questions you ask Ask 3C (see AI Features below).
                </li>
                <li>
                  <strong>Customer information.</strong> When you log a sale, you enter details about the
                  customer. See Customer Information below.
                </li>
                <li>
                  <strong>Support and request forms.</strong> When you report a bug in the portal, we keep
                  what you write, the area and page you were on, and your name and email. When you send a
                  request form (such as an expedite order, a payroll dispute, or a leads request), we
                  keep what you enter in it. Our office staff use these to help you.
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
                  type, pages visited, referring URL, and similar usage data, collected through cookies
                  and, on our public website pages, cookieless page analytics.
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
                them only what the feature needs, and only when you use the feature. Before you use
                Ask 3C or screenshot auto-fill for the first time, the portal names the AI provider,
                says what will be sent, and asks for your permission. If you choose &ldquo;Not now,&rdquo;
                nothing is sent, and you can still log sales by typing them in.
              </p>
              <ul>
                <li>
                  <strong>Sale screenshot auto-fill.</strong> When you log a sale, you can have the portal
                  read your sale confirmation screenshot and fill in the form for you. The screenshot you
                  choose is sent to Google&apos;s Gemini service to read it. It usually shows the
                  customer&apos;s name, address, phone number, and order number. You review every field
                  before you submit. The screenshot itself is saved with your sale as proof of the order.
                </li>
                <li>
                  <strong>Ask 3C.</strong> Ask 3C answers questions about the portal and selling. Your
                  question, the earlier messages in that conversation, any photo you attach, and some of
                  your own portal information (your first name, city and state, dealer code, and your
                  recent sales and installs, Board standing, team call times, forms, and notification
                  types) are sent to DeepSeek, an AI provider, to generate the answer. Customer names,
                  street addresses, phone numbers, and emails are not sent: each sale is described by a
                  letter (&ldquo;Customer A&rdquo;), its city, and at most the last four characters of
                  its order number. Other reps on the Board appear as &ldquo;Teammate 1,&rdquo;
                  &ldquo;Teammate 2,&rdquo; and so on, never by name. Email addresses and phone numbers
                  you type are removed before your question is sent or saved. We keep a record of each question and answer so we can improve Ask 3C.
                  Photos you attach are not saved.
                </li>
                <li>
                  <strong>Voice sales practice.</strong> Practice lets you rehearse a door conversation
                  with an AI homeowner. In hands-free mode, your microphone audio is streamed to
                  Google&apos;s Gemini service to turn your speech into text, and the homeowner&apos;s
                  replies are spoken using Google&apos;s Gemini text-to-speech. Practice voice asks first:
                  it sends your mic audio to Google Gemini to play the homeowner, and the audio
                  isn&apos;t stored. If you say no, Practice uses your phone&apos;s own voice instead. Otherwise, your speech is
                  turned into text by your phone or browser&apos;s built-in speech recognition (on
                  iPhone, provided by Apple). The transcript of your practice conversation is sent to
                  DeepSeek to generate the homeowner&apos;s replies and your coaching feedback, and we keep a
                  record of each finished practice session and its feedback. We do not save recordings
                  of your voice.
                </li>
              </ul>
              <p>
                We use Google&apos;s Gemini service on a paid Google plan, and Google does not use the
                data we send it to train its models.
              </p>
            </LegalSection>

            <LegalSection id="privacy-5" title="5. Customer Information">
              <p>
                When you log a sale, you enter the customer&apos;s name, phone number, email address,
                and service address, the plan, and the order number, and you attach a screenshot of the
                order confirmation. We use this to track the sale and its install, to match it with the
                install reports the carrier sends us, and to work out pay.
              </p>
              <p>
                You, your managers, and authorized 3C office staff can see these details in the portal.
                If you get our weekly installs email, it lists your own customers&apos; names and short addresses. If
                you use screenshot auto-fill, the screenshot you choose is sent to Google Gemini to read
                it (see AI Features above). Ask 3C does not send customer names, addresses, phone
                numbers, or emails. We do not send customer information to the carriers or sell it.
              </p>
            </LegalSection>

            <LegalSection id="privacy-6" title="6. Team Chat">
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
              <p>
                In the 3C app, before you first post in team chat, you agree to the team chat rules, and we record
                when you agreed. Chat has an automatic filter that applies to everyone, administrators included: a message containing a slur is not sent,
                and a small set of severe profanity is replaced with asterisks before the message is
                saved.
              </p>
              <p>
                You can report another person&rsquo;s message, and you can block someone. When you
                report a message, we keep the report with your name, the reason and any note you add,
                a copy of the reported message (its text and any attachment link), who sent it, and
                the channel. When you block someone, we keep that on your account with their display
                name; their messages are hidden behind a &ldquo;Show&rdquo; button for you, and you
                stop getting notifications for their messages. You can unblock them at any time. The
                person you report or block is not told.
              </p>
              <p>
                Reports and blocks alert 3C World Group back-office administrators by push
                notification and email. Those alerts name the people involved and the reason, but
                never include the reported message itself. Administrators review reports and may remove
                content or take action on accounts that break our rules. We keep a record of how each
                report was resolved and by whom. To stop misuse, we keep a small count of how often
                each person reports and blocks.
              </p>
              <p>
                Reports are kept after they are resolved, as a moderation record. If a person named
                in a report deletes their account, their name in the report is replaced with
                &ldquo;Deleted user,&rdquo; but the copy of the reported message is kept as evidence.
                If a reported message with a photo or file is deleted, we keep a private copy of
                that photo or file with the report as evidence.
              </p>
            </LegalSection>

            <LegalSection id="privacy-7" title="7. How We Share Your Information">
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
                    <li>Vercel, which hosts our website and portal and provides cookieless page analytics on our public website pages.</li>
                    <li>Postmark, which sends our email, including the signed onboarding documents sent to the owners.</li>
                    <li>Google Gemini, for sale screenshot auto-fill (the screenshots you choose) and for Practice voice (your mic audio in hands-free practice, and the homeowner&apos;s spoken replies), each only after you agree.</li>
                    <li>
                      DeepSeek, which generates Ask 3C answers and the practice homeowner&apos;s
                      replies and coaching feedback.
                    </li>
                    <li>Google reCAPTCHA, which helps block automated sign-ups.</li>
                    <li>Google Workspace, where we keep a copy of contractor applications.</li>
                    <li>GIPHY, for GIFs in team chat.</li>
                    <li>Apple and Google, if you choose to sign in with them, and Apple for delivering notifications to iPhones.</li>
                  </ul>
                </li>
                <li>
                  <strong>Within 3C World Group.</strong> Your managers and authorized staff see the
                  portal information they need to do their jobs, such as your sales records (including the
                  customer details in them) and onboarding status. Your name and sales results may appear on team leaderboards that other portal
                  users can see.
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

            <LegalSection id="privacy-8" title="8. Cookies and Analytics">
              <p>
                We use cookies and similar technologies to keep you signed in to the portal, remember
                preferences, and understand how visitors use our site. You can control cookies through
                your browser settings. Disabling cookies may limit some functionality of the portal.
                Our public website pages use Vercel&apos;s cookieless page analytics, and when you submit
                a contractor application we record how you found our website, such as the referring site
                or campaign. The portal and the 3C Portal app do not use page analytics, advertising, or
                other third-party analytics tools.
              </p>
            </LegalSection>

            <LegalSection id="privacy-9" title="9. Data Security">
              <p>
                We use reasonable administrative, technical, and physical safeguards to protect your
                information, including encrypted connections, access controls on portal data, and
                additional encryption for Social Security and driver&apos;s license numbers in our
                database. Signed tax and direct-deposit forms are kept in access-controlled file storage
                and are also sent to the owners by email (see Information We Collect). However, no
                method of transmission or storage is 100% secure, and we cannot guarantee absolute
                security.
              </p>
            </LegalSection>

            <LegalSection id="privacy-10" title="10. Data Retention and Account Deletion">
              <p>
                We keep your personal information while you work with 3C World Group. We aim to delete
                or anonymize it within 3 years after you stop working with 3C. Your pay and sales
                records are kept for the same period for payroll and tax reasons.
              </p>
              <p>
                <strong>Deleting your portal account.</strong> You can delete your portal account at any
                time in the 3C Portal iPhone app under Settings &gt; Delete account, or by asking us
                (see Contact Us below). If your sign-up is still waiting for approval, you can delete
                the request from that screen. When your account is deleted, we close your sign-in and
                remove your personal profile details (contact information, address, profile photo),
                your Social Security and driver&apos;s license numbers and license photos, and your
                notification devices. Your profile, the chat messages you sent, the chat list preview of
                your last message, your Ask 3C and practice history, other people&apos;s block lists, and
                chat reports you filed or that name you show as &ldquo;Deleted user.&rdquo;
              </p>
              <p>
                Some records are kept after deletion because we need them for business and legal
                reasons: your sales, commission, and pay records, including the sale screenshots
                attached to them, which we must keep for payroll, tax, and carrier reconciliation;
                signed contractor paperwork, such as tax and direct-deposit forms and contractor
                agreements; a log of who viewed your identity information; and, in chat reports, the
                copy of a reported message (its text, and any attached photo or file), kept as
                moderation evidence with the names replaced. The chat messages you sent and your Ask 3C
                questions and practice sessions are also kept, anonymized: the author shows as
                &ldquo;Deleted user.&rdquo; These records are kept for the retention period above.
              </p>
            </LegalSection>

            <LegalSection id="privacy-11" title="11. Your Rights and Choices">
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
                <a href="#privacy-15" className={kit.inlineLink}>
                  Contact Us
                </a>{" "}
                below. We may need to verify your identity before fulfilling a request.
              </p>
            </LegalSection>

            <LegalSection id="privacy-12" title="12. Children's Privacy">
              <p>
                Our website and services are not directed to anyone under 18, and we do not knowingly
                collect personal information from anyone under 18. If you believe someone under 18 has
                provided us with personal information, please contact us so we can delete it.
              </p>
            </LegalSection>

            <LegalSection id="privacy-13" title="13. Third-Party Links">
              <p>
                Our site may contain links to third-party websites that we do not control. This Privacy
                Policy does not apply to those sites, and we encourage you to read their privacy
                policies before providing any information.
              </p>
            </LegalSection>

            <LegalSection id="privacy-14" title="14. Changes to This Policy">
              <p>
                We may update this Privacy Policy from time to time. When we do, we will revise the
                &ldquo;Last updated&rdquo; date at the top of this page. Material changes will be
                communicated through the website or by email where appropriate.
              </p>
            </LegalSection>

            <LegalSection id="privacy-15" title="15. Contact Us">
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
                <LegalContactFormItem linkClassName={kit.inlineLink} />
              </ul>
            </LegalSection>
          </div>

          <div className={styles.close}>
            <p>Have questions? We&apos;re here to help.</p>
            <LegalContactButton className={`${kit.btn} ${kit.btnLime}`} arrowClassName={kit.btnArrow} />
          </div>
        </div>
      </section>
    </>
  );
}
