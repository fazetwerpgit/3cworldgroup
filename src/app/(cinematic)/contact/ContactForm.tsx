"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check } from "lucide-react";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./contact.module.css";

/**
 * The message form: the same five fields and five subjects as the page this
 * replaced, posted to /api/public/contact, which stores the message and
 * emails the owners. Until 2026-09-21 the submit was simulated (a one-second
 * wait, then "Message sent"), which meant every message typed into the live
 * site went nowhere. The honeypot is the same one Apply uses.
 *
 * It is a client component only so `page.tsx` can stay a server component and
 * keep its `metadata` export.
 */

const SUBJECTS = [
  { value: "services", label: "Service Inquiry" },
  { value: "careers", label: "Career Opportunity" },
  { value: "support", label: "Customer Support" },
  { value: "partnership", label: "Partnership Inquiry" },
  { value: "other", label: "Other" },
];

/*
  What each field says when the browser rejects it. Short, and about what to do
  rather than about the rule that was broken — `validationMessage` is the
  backstop for anything not listed, so a browser that invents a new failure
  still says something true.
*/
const MISSING: Record<string, string> = {
  name: "Enter your full name.",
  email: "Enter your email address.",
  subject: "Choose a subject.",
  message: "Write your message.",
};

const MISMATCH: Record<string, string> = {
  email: "Enter a valid email address.",
  phone: "Enter a valid phone number.",
};

function messageFor(field: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement): string {
  const { validity, name, validationMessage } = field;
  if (validity.valueMissing) return MISSING[name] ?? "This field is required.";
  if (validity.typeMismatch) return MISMATCH[name] ?? "Check this value.";
  return validationMessage || "Check this value.";
}

/*
  The one line the alert region carries when a submit is blocked. It is derived
  from `invalid` rather than stored, so it appears with the first rejected
  field and goes as the last one is fixed, with nothing to keep in step.
*/
const INVALID_SUMMARY = "Fill in the highlighted fields.";

/*
  The draft.

  A reader who opens /services to check what they are writing about and comes
  back used to find an empty form: a client-side navigation unmounts this
  component, and the back navigation mounts a new one with empty state. The
  browser's own form restore does not apply — these are controlled inputs, and
  React writes the empty state over whatever the browser put back.

  sessionStorage, not localStorage: the draft belongs to this tab and this
  visit. A message half-written on a shared machine should not still be sitting
  there tomorrow, and it is removed the moment the message is actually sent.

  The honeypot is never stored. It is only ever filled by something automated,
  and a stored value would arm it against the person who comes back.
*/
const DRAFT_KEY = "3c:contact-draft";

type Draft = {
  name?: string;
  email?: string;
  phone?: string;
  subject?: string;
  message?: string;
};

export default function ContactForm() {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
    website: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  /*
    A4 — which fields the browser has rejected, and WHY, in this page's own
    words. It holds a sentence per field rather than a flag: `aria-invalid`
    alone told a screen reader that something was wrong and nothing about what,
    and the native bubble it used to leave that to is invisible to anyone not
    looking at the field it points at. Each sentence is rendered under its
    field, given an id, and named by that field's `aria-describedby`.

    Driven by the controls' own `invalid` event, which the browser fires on a
    blocked submit, and cleared per field as it is edited. Native validation is
    still what blocks the submit; this only explains it.
  */
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  /*
    The duplicate-submit guard. `submitting` disables the button, but state is
    not readable until React has re-rendered — a double click inside one frame,
    or Enter held down in a field, runs `handleSubmit` twice against the old
    `false` and sends the message twice. The ref flips synchronously on the
    first call, so the second returns before it reaches fetch.
  */
  const pendingRef = useRef(false);
  /*
    A11y — the success panel REPLACES the form, so the element the reader was
    on is gone and focus falls to <body>: a screen reader is left at the top of
    the document with no idea the message went. Focus moves to the heading
    instead, which is both the announcement and the place to read on from.
    `preventScroll` because the panel stands exactly where the form did and the
    page should not jump.

    The panel used to carry `aria-live="polite"` and that never announced
    anything: a live region is only announced when its contents CHANGE, and
    this one mounted with its text already in it. The region below is in the
    DOM empty for a paint first and filled after, which is the change an
    assistive technology is listening for.
  */
  const sentTitleRef = useRef<HTMLHeadingElement>(null);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!submitted) return;
    sentTitleRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setAnnounced(true), 120);
    return () => window.clearTimeout(timer);
  }, [submitted]);

  /*
    Restore once, on mount. `restored` also gates the writer below, so the
    empty state of the first render is never written over a real draft.
  */
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw) as Draft;
        setFormData((current) => ({
          ...current,
          name: draft.name ?? current.name,
          email: draft.email ?? current.email,
          phone: draft.phone ?? current.phone,
          subject: draft.subject ?? current.subject,
          message: draft.message ?? current.message,
        }));
      }
    } catch {
      // A draft that will not parse, or storage that is blocked outright in a
      // private window, is not worth failing the form over. The reader simply
      // starts with the empty form they would have had anyway.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    // Never after a send: the message is gone and the next visitor to this tab
    // should not find it waiting in the box.
    if (!restored || submitted) return;
    const timer = window.setTimeout(() => {
      try {
        const draft: Draft = {
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject,
          message: formData.message,
        };
        window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      } catch {
        // Storage full or blocked; the form still works.
      }
    }, 400);
    return () => window.clearTimeout(timer);
  }, [formData, restored, submitted]);

  useEffect(() => {
    if (!submitted) return;
    try {
      window.sessionStorage.removeItem(DRAFT_KEY);
    } catch {
      // Nothing to do: the draft outliving a sent message is a nuisance, not a
      // failure, and there is no second way to remove it.
    }
  }, [submitted]);

  const handleInvalid = (
    e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const field = e.currentTarget;
    setInvalid((current) => ({ ...current, [field.name]: messageFor(field) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setSubmitting(true);
    setError("");
    setInvalid({});

    if (formData.website) {
      setSubmitted(true);
      setSubmitting(false);
      pendingRef.current = false;
      return;
    }

    try {
      const response = await fetch("/api/public/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          phone: formData.phone,
          subject: formData.subject,
          message: formData.message,
        }),
      });
      if (!response.ok) {
        /*
          The server's own sentence when it wrote one — it knows which field it
          rejected and this one does not. The catch below is for the case where
          there is no response to read a sentence out of, which is why it does
          not repeat `err.message`: "Failed to fetch" is not a sentence anyone
          should be shown. Nothing is cleared either way, so every value typed
          is still in the form to send again.
        */
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        setError(data.error || "Failed to send message. Please try again.");
        return;
      }
      setSubmitted(true);
    } catch (err) {
      console.error("Error sending contact message:", err);
      setError("Failed to send message. Please try again.");
    } finally {
      setSubmitting(false);
      pendingRef.current = false;
    }
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setInvalid((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  if (submitted) {
    return (
      <div className={styles.sent}>
        <span className={styles.sentMark} aria-hidden="true">
          <Check size={22} strokeWidth={3} />
        </span>
        <h3 className={styles.sentTitle} ref={sentTitleRef} tabIndex={-1}>
          Message sent.
        </h3>
        <p className={styles.sentBody}>
          Thank you for reaching out. Your message is with the 3C team.
        </p>
        {/*
          Deliberately not the heading's own words. `review/forms.mjs` asserts
          that exactly one node on the page reads "Message sent.", and a second
          copy in here would make that count two — the visible heading is what
          that assertion is about.
        */}
        <p className={kit.srOnly} role="status" aria-live="polite">
          {announced ? "Your message has been sent. It is with the 3C team." : ""}
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={styles.form}
      noValidate={false}
      aria-busy={submitting || undefined}
    >
      <div aria-hidden="true" className={styles.honeypot}>
        <label htmlFor="contact-website">Website (leave blank)</label>
        <input
          type="text"
          id="contact-website"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={formData.website}
          onChange={handleChange}
        />
      </div>
      <div className={styles.formPair}>
        {/*
          The error text is a sibling of the <label>, never a child of it. The
          control is wrapped by its label, so everything inside that label is
          the control's accessible NAME — an error rendered in there would be
          read as part of the field's name for the rest of the session rather
          than as its error. Outside it, `aria-describedby` names it as the
          description it is.
        */}
        <div className={styles.field}>
          <label className={styles.fieldControl} htmlFor="contact-name">
            <span className={styles.fieldLabel}>
              Full name <span className={styles.req}>*</span>
            </span>
            <input
              className={styles.input}
              type="text"
              id="contact-name"
              name="name"
              aria-invalid={invalid.name ? true : undefined}
              aria-describedby={invalid.name ? "contact-name-error" : undefined}
              onInvalid={handleInvalid}
              required
              value={formData.name}
              onChange={handleChange}
              placeholder="Your full name"
            />
          </label>
          {invalid.name ? (
            <span className={styles.fieldError} id="contact-name-error">
              {invalid.name}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldControl} htmlFor="contact-email">
            <span className={styles.fieldLabel}>
              Email address <span className={styles.req}>*</span>
            </span>
            <input
              className={styles.input}
              type="email"
              id="contact-email"
              name="email"
              aria-invalid={invalid.email ? true : undefined}
              aria-describedby={invalid.email ? "contact-email-error" : undefined}
              onInvalid={handleInvalid}
              required
              value={formData.email}
              onChange={handleChange}
              placeholder="you@email.com"
            />
          </label>
          {invalid.email ? (
            <span className={styles.fieldError} id="contact-email-error">
              {invalid.email}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.formPair}>
        <div className={styles.field}>
          <label className={styles.fieldControl} htmlFor="contact-phone">
            <span className={styles.fieldLabel}>Phone number</span>
            <input
              className={styles.input}
              type="tel"
              id="contact-phone"
              name="phone"
              aria-invalid={invalid.phone ? true : undefined}
              aria-describedby={invalid.phone ? "contact-phone-error" : undefined}
              onInvalid={handleInvalid}
              value={formData.phone}
              onChange={handleChange}
              placeholder="Your phone number"
            />
          </label>
          {invalid.phone ? (
            <span className={styles.fieldError} id="contact-phone-error">
              {invalid.phone}
            </span>
          ) : null}
        </div>

        <div className={styles.field}>
          <label className={styles.fieldControl} htmlFor="contact-subject">
            <span className={styles.fieldLabel}>
              Subject <span className={styles.req}>*</span>
            </span>
            <select
              className={`${styles.input} ${styles.select}`}
              id="contact-subject"
              name="subject"
              aria-invalid={invalid.subject ? true : undefined}
              aria-describedby={invalid.subject ? "contact-subject-error" : undefined}
              onInvalid={handleInvalid}
              required
              value={formData.subject}
              onChange={handleChange}
            >
              <option value="">Select a subject</option>
              {SUBJECTS.map((subject) => (
                <option key={subject.value} value={subject.value}>
                  {subject.label}
                </option>
              ))}
            </select>
          </label>
          {invalid.subject ? (
            <span className={styles.fieldError} id="contact-subject-error">
              {invalid.subject}
            </span>
          ) : null}
        </div>
      </div>

      <div className={styles.field}>
        <label className={styles.fieldControl} htmlFor="contact-message">
          <span className={styles.fieldLabel}>
            Message <span className={styles.req}>*</span>
          </span>
          <textarea
            className={`${styles.input} ${styles.textarea}`}
            id="contact-message"
            name="message"
            aria-invalid={invalid.message ? true : undefined}
            aria-describedby={invalid.message ? "contact-message-error" : undefined}
            onInvalid={handleInvalid}
            required
            rows={5}
            value={formData.message}
            onChange={handleChange}
            placeholder="How can we help you?"
          />
        </label>
        {invalid.message ? (
          <span className={styles.fieldError} id="contact-message-error">
            {invalid.message}
          </span>
        ) : null}
      </div>

      {/*
        R1 — with JavaScript off the submit handler never runs and the form has
        no `action`, so pressing the button would silently reload the page. The
        notice is the fallback the reader gets instead.
      */}
      <noscript>
        <p className={styles.formNoscript}>
          This form needs JavaScript to send. Email{" "}
          <a href="mailto:info@3cworldgroup.com">info@3cworldgroup.com</a> and we will pick
          it up from there.
        </p>
      </noscript>

      {/*
        A4 — present from first paint and empty, not mounted on failure: a live
        region that appears at the same moment its text does is not reliably
        announced.
      */}
      <div className={styles.formError} role="alert" aria-live="assertive">
        {error || (Object.keys(invalid).length > 0 ? INVALID_SUMMARY : "")}
      </div>

      <div className={styles.formActions}>
        {/*
          Both labels are in the DOM, stacked in one grid cell, and the inactive
          one is `visibility: hidden` — so this button keeps the width of the
          longer string and the height of the line box whichever state it is in.
          The arrow stays for the same reason: dropping it mid-submit took 25px
          off the button and the note under it jumped. Hidden to assistive tech
          as well as to the eye, so only one label is ever announced.
        */}
        <button
          type="submit"
          disabled={submitting}
          className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}
        >
          <span className={styles.submitLabel}>
            <span data-hidden={submitting || undefined}>Send message</span>
            <span data-hidden={!submitting || undefined}>Sending…</span>
          </span>
          <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
        </button>
        <p className={styles.formNote}>
          Fields marked <span className={styles.req}>*</span> are required.
        </p>
      </div>
    </form>
  );
}
