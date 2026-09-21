import type { Metadata } from "next";
import kit from "../../_cinematic/cinematic.module.css";
import ApplyFlow from "./ApplyFlow";
import styles from "./apply.module.css";

export const metadata: Metadata = {
  title: "Apply | 3C World Group",
  description:
    "Apply to sell fiber internet, TV and home security door to door with 3C World Group. A 1099, commission-only role with full training and no experience needed.",
};

/**
 * The conversion target of the site, so the shape of this file is deliberate:
 * the page head and the form live in ApplyFlow, and everything below the form
 * is passed to it as children. That keeps these three sections server-rendered
 * while still letting a successful submit replace the entire page — which is
 * what the route has always done, and the right behaviour, because none of the
 * copy below is addressed to someone who has already applied.
 *
 * The chrome, the motion root and the `.page` element are in
 * src/app/(cinematic)/layout.tsx. This file is sections.
 */

const STEPS = [
  {
    n: "01",
    title: "We review your application",
    body: "It goes to the recruiting team for the market you named.",
  },
  {
    n: "02",
    title: "A 15-minute phone call",
    body: "A real conversation about the role and about you — what you are looking for, and what the work actually asks.",
  },
  {
    n: "03",
    title: "Training, then the field",
    body: "The products, the people and the sales process, with hands-on coaching from experienced leaders before you work a route.",
  },
];

const GOOD_TO_KNOW = [
  {
    term: "1099 independent contractor",
    def: "You work as a 1099 independent contractor under an independent contractor agreement that sets out compensation and scope, and you are responsible for your own taxes.",
  },
  {
    term: "Commission-only, uncapped",
    def: "There is no salary component. Your effort drives your earnings, and top performers earn more.",
  },
  {
    term: "No sales experience required",
    def: "3C provides full training and ongoing support — the products, the sales process, roleplay and coaching in the field, not only in a classroom.",
  },
  {
    term: "What you would represent",
    def: "Fiber internet, TV service and home security systems from the providers 3C represents, individually or bundled.",
  },
];

export default function ApplyPage() {
  return (
    <ApplyFlow>
      {/* ---------------------------------------------------------------- */}
      {/* What happens next — paper, and the only seam on the page          */}
      {/* ---------------------------------------------------------------- */}
      <section id="next" className={styles.next} aria-labelledby="next-title">
        <div className={kit.shell}>
          <header className={kit.sectionHeadInk} data-reveal>
            <h2 id="next-title" className={kit.sectionTitleInk}>
              What happens
              <br />
              next.
            </h2>
            <p className={kit.sectionLedeInk}>
              Three steps between the form above and your first route. Timing depends on the
              market and on you.
            </p>
          </header>

          <ol className={styles.steps}>
            {STEPS.map((step) => (
              <li key={step.n} className={`${styles.step} ${kit.revealRise}`} data-reveal>
                <h3 className={styles.stepTitle}>{step.title}</h3>
                <p className={styles.stepBody}>{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ---------------------------------------------------------------- */}
      {/* Good to know — navy, a definition list on hairlines               */}
      {/* ---------------------------------------------------------------- */}
      <section id="good-to-know" className={styles.know} aria-labelledby="know-title">
        <div className={kit.shell}>
          <header className={kit.sectionHead} data-reveal>
            <h2 id="know-title" className={kit.sectionTitle}>
              Good to know
              <br />
              before you apply.
            </h2>
            <p className={kit.sectionLede}>
              Four things about the role that are better read now than discovered later.
              The same four terms sit above the submit button.
            </p>
          </header>

          <dl className={styles.knowList}>
            {GOOD_TO_KNOW.map((item) => (
              <div key={item.term} className={`${styles.knowRow} ${kit.revealRise}`} data-reveal>
                <dt className={styles.knowTerm}>{item.term}</dt>
                <dd className={styles.knowDef}>{item.def}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </ApplyFlow>
  );
}
