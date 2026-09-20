"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import kit from "../../_cinematic/cinematic.module.css";
import styles from "./apply.module.css";

/**
 * The working half of /apply.
 *
 * The state, the validation, the honeypot, the POST to
 * /api/public/applications and the success handoff are carried over from the
 * page this replaces without a change to any of them — what a submit sends and
 * what it does with every response is byte-for-byte the previous behaviour.
 * Only the surface around it is new.
 *
 * It wraps the page's later sections as `children` rather than sitting inside
 * them, because a successful submit has to replace the whole page: once the
 * application is in, the steps, the terms and a second Apply are no longer
 * addressed to the reader. Keeping them as children means they still render on
 * the server and only the decision to show them lives on the client.
 */
export default function ApplyFlow({ children }: { children: React.ReactNode }) {
  const formStartedAtRef = useRef(Date.now());
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    email: "",
    city: "",
    referredBy: "",
    website: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<{ message: string; code: string } | null>(null);

  const applyReferral = useCallback((ref: string) => {
    setFormData((prev) => ({ ...prev, referredBy: ref }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    if (formData.website || Date.now() - formStartedAtRef.current < 3000) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await fetch("/api/public/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          city: formData.city,
          referredBy: formData.referredBy,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as { error?: string; code?: string };
        if (response.status === 409 && data.code === "account_exists") {
          setSubmitError({
            message: data.error || "You already have a 3C portal account. Sign in instead of re-applying.",
            code: data.code,
          });
          return;
        }
        throw new Error(data.error || "Failed to submit application");
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error("Error submitting application:", error);
      alert("There was an error submitting your application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <section className={styles.done} aria-labelledby="done-title">
        <Image
          src="/redesign/v2/photos/hero-wide-1600.webp"
          alt=""
          fill
          priority
          sizes="100vw"
          className={styles.doneArt}
        />
        <div className={kit.shell}>
          <div className={styles.doneInner}>
            <span className={styles.doneMark} aria-hidden="true">
              <Check size={30} strokeWidth={3} />
            </span>
            <p className={styles.doneEyebrow}>Application received</p>
            <h1 id="done-title" className={styles.doneTitle}>
              That is step
              <br />
              one, done.
            </h1>
            <p className={styles.doneLede}>
              Your application is with the 3C recruiting team.
            </p>

            <div className={styles.doneNote}>
              <h2 className={styles.doneNoteTitle}>While you wait</h2>
              <p className={styles.doneNoteBody}>
                Keep an eye on your phone. The team calls from local numbers, so save the
                number if one comes through.
              </p>
            </div>

            <div className={styles.doneActions}>
              <Link href="/" className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Back to home
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </Link>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      {/*
        The `?ref=` prefill is the page's only use of the search params, and
        `useSearchParams` opts whatever renders it out of static rendering. It
        is isolated to this one-line component behind its own Suspense boundary
        rather than wrapped around the page, so the form and every section
        below it still render and hydrate as ordinary server output — which is
        also what keeps MotionRoot's reveals from landing on a subtree React
        has not hydrated yet.
      */}
      <Suspense>
        <ReferralFromQuery onReferral={applyReferral} />
      </Suspense>

      {/* ------------------------------------------------------------------ */}
      {/* 1 — how the page opens: flat navy, no reveal, simply there         */}
      {/* ------------------------------------------------------------------ */}
      <header className={kit.pageHead}>
        <div className={kit.shell}>
          <div className={kit.pageHeadRow}>
            <div>
              <p className={kit.pageHeadEyebrow}>Apply</p>
              {/*
                No authored line break. The head's left column is half the
                shell, and at the title's capped size the longest line that
                fits it is about thirteen characters — a hand-placed break
                either overhangs the gap at 1440 or reads as a different shape
                at 1024, where the row is already one column.
              */}
              <h1 className={kit.pageHeadTitle}>Your next chapter starts here.</h1>
            </div>
            <p className={kit.pageHeadLede}>
              Five fields, no resume. Door-to-door sales of fiber internet, TV and home
              security — a 1099 independent contractor role, commission-only and uncapped,
              with full training and no experience needed.
            </p>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 2 — the form. The page.                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.applySection} aria-labelledby="apply-form-title">
        <div className={styles.applyArt} aria-hidden="true">
          <Image
            src="/redesign/v2/photos/hero-wide-1600.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={styles.applyArtImage}
          />
          <div className={styles.applyArtScrim} />
        </div>

        <div className={kit.shell}>
          <div className={styles.applyLayout}>
            {/*
              No reveal on this panel on purpose. Every other block on the page
              arrives; the form is already there when the page is.
            */}
            <div id="apply-form" className={styles.formPanel}>
              <h2 id="apply-form-title" className={styles.formTitle}>
                Start your application
              </h2>
              <p className={styles.formLede}>No resume needed. Just tell us about yourself.</p>

              <form onSubmit={handleSubmit} className={styles.form}>
                <div aria-hidden="true" className={styles.honeypot}>
                  <label htmlFor="website">Website (leave blank)</label>
                  <input
                    type="text"
                    id="website"
                    name="website"
                    tabIndex={-1}
                    autoComplete="off"
                    value={formData.website}
                    onChange={handleChange}
                  />
                </div>

                <div className={styles.fieldPair}>
                  <label className={styles.field} htmlFor="apply-name">
                    <span className={styles.fieldLabel}>Full Name*</span>
                    <input
                      className={styles.input}
                      type="text"
                      id="apply-name"
                      name="name"
                      autoComplete="name"
                      required
                      value={formData.name}
                      onChange={handleChange}
                      placeholder="Enter your full name"
                    />
                  </label>

                  <label className={styles.field} htmlFor="apply-phone">
                    <span className={styles.fieldLabel}>Phone*</span>
                    <input
                      className={styles.input}
                      type="tel"
                      id="apply-phone"
                      name="phone"
                      autoComplete="tel"
                      required
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(555) 123-4567"
                    />
                  </label>
                </div>

                <label className={styles.field} htmlFor="apply-email">
                  <span className={styles.fieldLabel}>Email*</span>
                  <input
                    className={styles.input}
                    type="email"
                    id="apply-email"
                    name="email"
                    autoComplete="email"
                    required
                    value={formData.email}
                    onChange={handleChange}
                    placeholder="you@example.com"
                  />
                </label>

                <label className={styles.field} htmlFor="apply-city">
                  <span className={styles.fieldLabel}>City*</span>
                  <input
                    className={styles.input}
                    type="text"
                    id="apply-city"
                    name="city"
                    autoComplete="address-level2"
                    required
                    value={formData.city}
                    onChange={handleChange}
                    placeholder="Enter your city"
                  />
                </label>

                <label className={styles.field} htmlFor="apply-referred-by">
                  <span className={styles.fieldLabel}>
                    Referred By <span className={styles.fieldOptional}>(optional)</span>
                  </span>
                  <input
                    className={styles.input}
                    type="text"
                    id="apply-referred-by"
                    name="referredBy"
                    value={formData.referredBy}
                    onChange={handleChange}
                    placeholder="How did you hear about us?"
                  />
                </label>

                {/* The terms that have always sat directly above the submit. */}
                <ul className={styles.terms}>
                  <li>
                    This is a <strong>1099 independent contractor</strong> role.
                  </li>
                  <li>
                    <strong>Commission-only</strong> with uncapped earnings.
                  </li>
                  <li>No sales experience required &mdash; full training provided.</li>
                </ul>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`${kit.btn} ${kit.btnLime} ${kit.btnLg} ${styles.submit}`}
                >
                  {isSubmitting ? "Submitting..." : "Submit my application"}
                  <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
                </button>

                {submitError?.code === "account_exists" ? (
                  <div className={styles.formError} role="alert">
                    {submitError.message}{" "}
                    <Link className={styles.formErrorLink} href="/portal">
                      Sign in
                    </Link>
                  </div>
                ) : null}

                <p className={styles.formFine}>
                  By applying, you agree to be contacted about opportunities.
                </p>
              </form>
            </div>

            <div className={`${styles.applyAside} ${kit.revealRise}`} data-reveal>
              <p className={styles.asideEyebrow}>What you are applying for</p>
              <h2 className={styles.asideTitle}>
                The work
                <br />
                behind the form.
              </h2>
              <p className={styles.asideBody}>
                Face-to-face sales in residential neighborhoods. You work an area on foot,
                knock, find out what a household is paying for internet, TV or security, and
                offer something that fits.
              </p>
              <hr className={styles.asideRule} />
              <p className={styles.asideBody}>
                3C trains you on the products, the people and the sales process, with
                hands-on coaching and support from experienced leaders in the field — before
                you work a route of your own.
              </p>
            </div>
          </div>
        </div>
      </section>

      {children}

      {/* ------------------------------------------------------------------ */}
      {/* Closing — the same door, one screen later                          */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.closing} aria-labelledby="apply-closing-title">
        <Image
          src="/redesign/v2/photos/fiber-dusk-1600.webp"
          alt=""
          fill
          sizes="100vw"
          className={styles.closingArt}
        />
        <div className={kit.shell}>
          <h2 id="apply-closing-title" className={styles.closingTitle}>
            Take the
            <br />
            <span className={styles.closingLime}>first step.</span>
          </h2>
          <p className={styles.closingLede}>
            It all starts with the form. Everything after it is a conversation.
          </p>
          <a href="#apply-form" className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
            Start your application
            <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
          </a>
        </div>
      </section>
    </>
  );
}

/**
 * Reads `?ref=` and hands it to the form. Renders nothing; it exists only so
 * the dynamic-rendering bailout `useSearchParams` causes is scoped to a node
 * with no output instead of to the whole page.
 */
function ReferralFromQuery({ onReferral }: { onReferral: (ref: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) onReferral(ref);
  }, [searchParams, onReferral]);

  return null;
}
