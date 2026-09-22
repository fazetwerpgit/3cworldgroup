"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import kit from "../../_cinematic/cinematic.module.css";
import { findMarket } from "../../_cinematic/markets";
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
/*
  What each field says when the browser rejects it. Short, and about what to do
  rather than about the rule that was broken — `validationMessage` is the
  backstop for anything not listed, so a browser that invents a new failure
  still says something true.
*/
const MISSING: Record<string, string> = {
  name: "Enter your full name.",
  phone: "Enter your phone number.",
  email: "Enter your email address.",
  city: "Enter the city you live in.",
};

const MISMATCH: Record<string, string> = {
  email: "Enter a valid email address.",
  phone: "Enter a valid phone number.",
};

function messageFor(field: HTMLInputElement): string {
  const { validity, name, validationMessage } = field;
  if (validity.valueMissing) return MISSING[name] ?? "This field is required.";
  if (validity.typeMismatch) return MISMATCH[name] ?? "Check this value.";
  return validationMessage || "Check this value.";
}

/*
  The one line the alert region carries when a submit is blocked. Derived from
  `invalid` rather than stored, so it appears with the first rejected field and
  goes as the last one is fixed, with nothing to keep in step.
*/
const INVALID_SUMMARY = "Fill in the highlighted fields.";

/*
  The draft.

  Someone who opens /opportunities to read what the role actually is and comes
  back used to find an empty form: a client-side navigation unmounts this
  component, and the back navigation mounts a new one with empty state. The
  browser's own form restore does not apply — these are controlled inputs, and
  React writes the empty state over whatever the browser put back.

  sessionStorage, not localStorage: the draft belongs to this tab and this
  visit, and it is removed the moment the application is actually in.

  The honeypot is never stored. It is only ever filled by something automated,
  and a stored value would arm it against the person who comes back.
*/
const DRAFT_KEY = "3c:apply-draft";

type Draft = {
  name?: string;
  phone?: string;
  email?: string;
  city?: string;
  referredBy?: string;
};

export default function ApplyFlow({ children }: { children: React.ReactNode }) {
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
  /*
    A4 — which fields the browser has rejected, and WHY, in this page's own
    words. It holds a sentence per field rather than a flag: `aria-invalid`
    alone told a screen reader that something was wrong and nothing about what,
    and the native bubble it used to leave that to is invisible to anyone not
    looking at the field it points at. Each sentence is rendered under its
    field, given an id, and named by that field's `aria-describedby`.

    Driven by the controls' own `invalid` event, cleared per field as it is
    edited. Native validation is still what blocks the submit; this only
    explains it.
  */
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  /*
    The duplicate-submit guard. `isSubmitting` disables the button, but state
    is not readable until React has re-rendered — a double click inside one
    frame, or Enter held down in a field, runs `handleSubmit` twice against the
    old `false` and posts the application twice. The ref flips synchronously on
    the first call, so the second one returns before it reaches fetch.
  */
  const pendingRef = useRef(false);
  /*
    A11y — the success screen REPLACES the whole page, so the element the
    reader was on is gone and focus falls to <body>: a screen reader is left at
    the top of the document with no idea the application went in. Focus moves
    to the heading instead, which is both the announcement and the place to
    read on from. `preventScroll` so it does not fight the smooth scroll to top
    the submit already started.

    The live region below is in the DOM empty for a paint and filled after,
    because a live region is only announced when its contents CHANGE — one that
    mounts with its text already in it announces nothing.
  */
  const doneTitleRef = useRef<HTMLHeadingElement>(null);
  const [announced, setAnnounced] = useState(false);

  useEffect(() => {
    if (!submitted) return;
    doneTitleRef.current?.focus({ preventScroll: true });
    const timer = window.setTimeout(() => setAnnounced(true), 120);
    return () => window.clearTimeout(timer);
  }, [submitted]);

  /*
    Restore once, on mount. `restored` also gates the writer below, so the
    empty state of the first render is never written over a real draft.

    `referredBy` is the one field the draft does not get to win. It is prefilled
    from `?ref=` in the URL of THIS visit by `ReferralFromQuery`, whose effect
    runs before this one because it is a child — so a stored value is only used
    where the link did not carry one.
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
          phone: draft.phone ?? current.phone,
          email: draft.email ?? current.email,
          city: draft.city ?? current.city,
          referredBy: current.referredBy || draft.referredBy || "",
        }));
      }
    } catch {
      // A draft that will not parse, or storage that is blocked outright in a
      // private window, is not worth failing the form over. The applicant
      // simply starts with the empty form they would have had anyway.
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    // Never after a submit: the application is in, and the next visitor to this
    // tab should not find someone else's name and phone number waiting.
    if (!restored || submitted) return;
    const timer = window.setTimeout(() => {
      try {
        const draft: Draft = {
          name: formData.name,
          phone: formData.phone,
          email: formData.email,
          city: formData.city,
          referredBy: formData.referredBy,
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
      // Nothing to do: the draft outliving a sent application is a nuisance,
      // not a failure, and there is no second way to remove it.
    }
  }, [submitted]);

  const applyReferral = useCallback((ref: string) => {
    setFormData((prev) => ({ ...prev, referredBy: ref }));
  }, []);

  /*
    `?market=` comes off Home's market explorer. It only ever prefills City,
    and only from a slug that names one of the five markets the site lists —
    an unknown slug fills in nothing, so a link cannot put arbitrary query
    text into the field. City stays a free-text input either way: the reader
    can replace the market with the town they actually live in, and what a
    submit sends is the same string it has always sent.
  */
  const applyMarket = useCallback((slug: string) => {
    const market = findMarket(slug);
    if (!market) return;
    setFormData((prev) => (prev.city ? prev : { ...prev, city: market.applyCity }));
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((current) => ({ ...current, [name]: value }));
    setInvalid((current) => {
      if (!current[name]) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  };

  const handleInvalid = (e: React.FormEvent<HTMLInputElement>) => {
    const field = e.currentTarget;
    setInvalid((current) => ({ ...current, [field.name]: messageFor(field) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);
    setInvalid({});

    /*
      Honeypot only. There used to be a second bot test here, "submitted
      under three seconds", that silently swallowed the application. A real
      person with autofill clears this form in under three seconds, and they
      saw the success screen while nothing was sent. The server keeps the
      honeypot check too.
    */
    if (formData.website) {
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
      setIsSubmitting(false);
      pendingRef.current = false;
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
        const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
        if (response.status === 409 && data.code === "account_exists") {
          setSubmitError({
            message: data.error || "You already have a 3C portal account. Sign in instead of re-applying.",
            code: data.code,
          });
          return;
        }
        /*
          The server's own sentence when it wrote one — it knows which field it
          rejected and this one does not. The catch below is for the case where
          there is no response to read a sentence out of.
        */
        setSubmitError({
          message: data.error || "There was an error submitting your application. Please try again.",
          code: "submit_failed",
        });
        return;
      }

      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      /*
        This used to be a `window.alert()`: a modal the reader had to dismiss
        before they could see the form again, with nothing left on the page
        afterwards to say the submit had failed. It goes to the same live
        region every other rejection uses. Nothing is cleared, so every field
        the applicant typed is still there to send again.
      */
      console.error("Error submitting application:", error);
      setSubmitError({
        message: "There was an error submitting your application. Please try again.",
        code: "submit_failed",
      });
    } finally {
      setIsSubmitting(false);
      pendingRef.current = false;
    }
  };

  if (submitted) {
    return (
      <section className={styles.done} aria-labelledby="done-title">
        <Image
          src="/redesign/cinematic/apply-doors-dusk-1920.webp"
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
            <h1 id="done-title" className={styles.doneTitle} ref={doneTitleRef} tabIndex={-1}>
              That is step
              <br />
              one, done.
            </h1>
            <p className={styles.doneLede}>
              Your application is with the 3C recruiting team.
            </p>
            <p className={kit.srOnly} role="status" aria-live="polite">
              {announced ? "Application received. Your application is with the 3C recruiting team." : ""}
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
        The `?ref=` and `?market=` prefills are the page's only use of the
        search params, and `useSearchParams` opts whatever renders it out of
        static rendering. They are isolated to this one component behind its own Suspense boundary
        rather than wrapped around the page, so the form and every section
        below it still render and hydrate as ordinary server output — which is
        also what keeps MotionRoot's reveals from landing on a subtree React
        has not hydrated yet.
      */}
      <Suspense>
        <PrefillFromQuery onReferral={applyReferral} onMarket={applyMarket} />
      </Suspense>

      {/* ------------------------------------------------------------------ */}
      {/* 1 — how the page opens: flat navy, no reveal, simply there         */}
      {/* ------------------------------------------------------------------ */}
      <header className={`${kit.pageHead} ${styles.head}`}>
        <div className={kit.pageHeadArt}>
          <Image
            src="/redesign/cinematic/apply-street-dusk-1920.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className={kit.pageHeadImage}
          />
        </div>
        <div className={kit.pageHeadScrim} aria-hidden="true" />

        <div className={kit.pageHeadInner}>
          <div className={kit.pageHeadCol}>
            <p className={kit.pageHeadEyebrow}>Apply</p>
            <h1 className={kit.pageHeadTitle}>
              Apply in
              <span className={kit.pageHeadLime}>five fields.</span>
            </h1>
            <p className={kit.pageHeadLede}>
              No resume. Door-to-door sales of fiber internet, TV and home security.
              1099 contractor, commission only, training included.
            </p>
            <div className={`${kit.pageHeadActions} ${styles.headActions}`}>
              <a href="#apply-form" className={`${kit.btn} ${kit.btnLime} ${kit.btnLg}`}>
                Start your application
                <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
              </a>
              <a href="#the-work" className={`${kit.btn} ${kit.btnGhost} ${kit.btnLg}`}>
                The work behind the form
              </a>
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------------ */}
      {/* 2 — the form. The page.                                            */}
      {/* ------------------------------------------------------------------ */}
      <section className={styles.applySection} aria-labelledby="apply-form-title">
        {/*
          The door, not the aerial. The head above already carries the aerial
          the homepage opens on; this section needed a photograph of its own so
          the short aside column does not leave several hundred pixels of empty
          navy beside a plate that is twice its height.
        */}
        <div className={styles.applyArt} aria-hidden="true">
          <Image
            src="/redesign/cinematic/apply-corner-dusk-1600.webp"
            alt=""
            fill
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

              <form onSubmit={handleSubmit} className={styles.form} aria-busy={isSubmitting || undefined}>
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

                {/*
                  The error text is a sibling of the <label>, never a child of
                  it. The control is wrapped by its label, so everything inside
                  that label is the control's accessible NAME — an error
                  rendered in there would be read as part of the field's name
                  for the rest of the session rather than as its error. Outside
                  it, `aria-describedby` names it as the description it is.
                */}
                <div className={styles.fieldPair}>
                  <div className={styles.field}>
                    <label className={styles.fieldControl} htmlFor="apply-name">
                      <span className={styles.fieldLabel}>Full Name <span className={styles.req}>*</span></span>
                      <input
                        className={styles.input}
                        type="text"
                        id="apply-name"
                        name="name"
                        aria-invalid={invalid.name ? true : undefined}
                        aria-describedby={invalid.name ? "apply-name-error" : undefined}
                        onInvalid={handleInvalid}
                        autoComplete="name"
                        required
                        value={formData.name}
                        onChange={handleChange}
                        placeholder="Enter your full name"
                      />
                    </label>
                    {invalid.name ? (
                      <span className={styles.fieldError} id="apply-name-error">
                        {invalid.name}
                      </span>
                    ) : null}
                  </div>

                  <div className={styles.field}>
                    <label className={styles.fieldControl} htmlFor="apply-phone">
                      <span className={styles.fieldLabel}>Phone <span className={styles.req}>*</span></span>
                      <input
                        className={styles.input}
                        type="tel"
                        id="apply-phone"
                        name="phone"
                        aria-invalid={invalid.phone ? true : undefined}
                        aria-describedby={invalid.phone ? "apply-phone-error" : undefined}
                        onInvalid={handleInvalid}
                        autoComplete="tel"
                        required
                        value={formData.phone}
                        onChange={handleChange}
                        placeholder="Your phone number"
                      />
                    </label>
                    {invalid.phone ? (
                      <span className={styles.fieldError} id="apply-phone-error">
                        {invalid.phone}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldControl} htmlFor="apply-email">
                    <span className={styles.fieldLabel}>Email <span className={styles.req}>*</span></span>
                    <input
                      className={styles.input}
                      type="email"
                      id="apply-email"
                      name="email"
                      aria-invalid={invalid.email ? true : undefined}
                      aria-describedby={invalid.email ? "apply-email-error" : undefined}
                      onInvalid={handleInvalid}
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                    />
                  </label>
                  {invalid.email ? (
                    <span className={styles.fieldError} id="apply-email-error">
                      {invalid.email}
                    </span>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldControl} htmlFor="apply-city">
                    <span className={styles.fieldLabel}>City <span className={styles.req}>*</span></span>
                    <input
                      className={styles.input}
                      type="text"
                      id="apply-city"
                      name="city"
                      aria-invalid={invalid.city ? true : undefined}
                      aria-describedby={invalid.city ? "apply-city-error" : undefined}
                      onInvalid={handleInvalid}
                      autoComplete="address-level2"
                      required
                      value={formData.city}
                      onChange={handleChange}
                      placeholder="Enter your city"
                    />
                  </label>
                  {invalid.city ? (
                    <span className={styles.fieldError} id="apply-city-error">
                      {invalid.city}
                    </span>
                  ) : null}
                </div>

                <div className={styles.field}>
                  <label className={styles.fieldControl} htmlFor="apply-referred-by">
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
                </div>

                {/* The terms that have always sat directly above the submit. */}
                <ul className={styles.terms}>
                  <li>
                    This is a <strong>1099 independent contractor</strong> role.
                  </li>
                  <li>
                    <strong>Commission-only</strong> with uncapped earnings.
                  </li>
                  <li>No sales experience required. Full training provided.</li>
                </ul>

                {/*
                  Both labels are in the DOM, stacked in one grid cell, and the
                  inactive one is `visibility: hidden` — so the button keeps the
                  width of the longer string and the height of the line box
                  whichever state it is in, and nothing under it moves when the
                  submit starts or fails. Hidden to assistive tech as well as to
                  the eye, so only one label is ever announced.
                */}
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`${kit.btn} ${kit.btnLime} ${kit.btnLg} ${styles.submit}`}
                >
                  <span className={styles.submitLabel}>
                    <span data-hidden={isSubmitting || undefined}>Submit my application</span>
                    <span data-hidden={!isSubmitting || undefined}>Submitting...</span>
                  </span>
                  <ArrowRight aria-hidden="true" className={kit.btnArrow} size={19} strokeWidth={2.2} />
                </button>

                {/*
                  A4 — in the DOM from first paint and empty, not mounted on
                  failure: a live region that appears at the same moment its
                  text does is not reliably announced. It also now carries every
                  rejection, not only `account_exists` — a server error used to
                  render nothing at all and leave the reader with a button that
                  had simply stopped doing anything.
                */}
                <div className={styles.formError} role="alert" aria-live="assertive">
                  {submitError
                    ? submitError.message
                    : Object.keys(invalid).length > 0
                      ? INVALID_SUMMARY
                      : ""}
                  {submitError?.code === "account_exists" ? (
                    <>
                      {" "}
                      <Link className={styles.formErrorLink} href="/portal">
                        Sign in
                      </Link>
                    </>
                  ) : null}
                </div>

                {/*
                  R1 — with JavaScript off the submit handler never runs and the
                  form has no `action`, so pressing the button would silently
                  reload the page. The notice is the fallback the reader gets.
                */}
                <noscript>
                  <p className={styles.formNoscript}>
                    This form needs JavaScript to send. Email{" "}
                    <a href="mailto:careers@3cworldgroup.com">careers@3cworldgroup.com</a> with
                    your name, phone and city and we will start your application for you.
                  </p>
                </noscript>

                <p className={styles.formFine}>
                  By applying, you agree to be contacted about opportunities.
                </p>
              </form>
            </div>

            <div id="the-work" className={`${styles.applyAside} ${kit.revealRise}`} data-reveal>
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
                hands-on coaching and support from experienced leaders in the field, before
                you work a route of your own.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/*
        No closer on this page. The form IS the page and sits at the top; a
        paper closer under "Good to know" cut the tail into 725px of navy, a
        342px paper sliver and the navy footer. The good-to-know section ends
        on a quiet link back up to the form instead.
      */}
      {children}
    </>
  );
}

/**
 * Reads `?ref=` and `?market=` and hands them to the form. Renders nothing; it
 * exists only so the dynamic-rendering bailout `useSearchParams` causes is
 * scoped to a node with no output instead of to the whole page.
 */
function PrefillFromQuery({
  onReferral,
  onMarket,
}: {
  onReferral: (ref: string) => void;
  onMarket: (slug: string) => void;
}) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) onReferral(ref);
    const market = searchParams.get("market");
    if (market) onMarket(market);
  }, [searchParams, onReferral, onMarket]);

  return null;
}
