"use client";

import { useRef, useState } from "react";
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
  // A4 — which fields the browser has rejected, so the same failure the native
  // bubble shows is also on the element for assistive tech. Driven by the
  // form's own `invalid` event (which fires on submit, capture-phase only,
  // because `invalid` does not bubble) and cleared per field as it is edited.
  const [invalid, setInvalid] = useState<Record<string, boolean>>({});
  /*
    The duplicate-submit guard. `submitting` disables the button, but state is
    not readable until React has re-rendered — a double click inside one frame,
    or Enter held down in a field, runs `handleSubmit` twice against the old
    `false` and sends the message twice. The ref flips synchronously on the
    first call, so the second returns before it reaches fetch.
  */
  const pendingRef = useRef(false);

  const handleInvalid = (
    e: React.FormEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name } = e.currentTarget;
    setInvalid((current) => ({ ...current, [name]: true }));
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
    setInvalid((current) => (current[name] ? { ...current, [name]: false } : current));
  };

  if (submitted) {
    return (
      <div className={styles.sent} aria-live="polite">
        <span className={styles.sentMark} aria-hidden="true">
          <Check size={22} strokeWidth={3} />
        </span>
        <h3 className={styles.sentTitle}>Message sent.</h3>
        <p className={styles.sentBody}>
          Thank you for reaching out. Your message is with the 3C team.
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
        <label className={styles.field} htmlFor="contact-name">
          <span className={styles.fieldLabel}>
            Full name <span className={styles.req}>*</span>
          </span>
          <input
            className={styles.input}
            type="text"
            id="contact-name"
            name="name"
            aria-invalid={invalid.name || undefined}
            onInvalid={handleInvalid}
            required
            value={formData.name}
            onChange={handleChange}
            placeholder="Your full name"
          />
        </label>

        <label className={styles.field} htmlFor="contact-email">
          <span className={styles.fieldLabel}>
            Email address <span className={styles.req}>*</span>
          </span>
          <input
            className={styles.input}
            type="email"
            id="contact-email"
            name="email"
            aria-invalid={invalid.email || undefined}
            onInvalid={handleInvalid}
            required
            value={formData.email}
            onChange={handleChange}
            placeholder="you@email.com"
          />
        </label>
      </div>

      <div className={styles.formPair}>
        <label className={styles.field} htmlFor="contact-phone">
          <span className={styles.fieldLabel}>Phone number</span>
          <input
            className={styles.input}
            type="tel"
            id="contact-phone"
            name="phone"
            aria-invalid={invalid.phone || undefined}
            onInvalid={handleInvalid}
            value={formData.phone}
            onChange={handleChange}
            placeholder="Your phone number"
          />
        </label>

        <label className={styles.field} htmlFor="contact-subject">
          <span className={styles.fieldLabel}>
            Subject <span className={styles.req}>*</span>
          </span>
          <select
            className={`${styles.input} ${styles.select}`}
            id="contact-subject"
            name="subject"
            aria-invalid={invalid.subject || undefined}
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
      </div>

      <label className={styles.field} htmlFor="contact-message">
        <span className={styles.fieldLabel}>
          Message <span className={styles.req}>*</span>
        </span>
        <textarea
          className={`${styles.input} ${styles.textarea}`}
          id="contact-message"
          name="message"
          aria-invalid={invalid.message || undefined}
          onInvalid={handleInvalid}
          required
          rows={5}
          value={formData.message}
          onChange={handleChange}
          placeholder="How can we help you?"
        />
      </label>

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
        {error}
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
