import styles from "./legal.module.css";

/**
 * One numbered clause of a legal document: the heading, then its body. Shared
 * by /privacy and /terms so the two pages cannot drift apart typographically.
 *
 * The heading is an `h2` under the page's single `h1`, and the id is derived
 * from the title so every clause is linkable — legal copy gets cited.
 */
export default function LegalSection({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className={styles.section} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}
