import MotionRoot from "../_cinematic/MotionRoot";
import SiteHeader from "../_cinematic/SiteHeader";
import SiteFooter from "../_cinematic/SiteFooter";
import styles from "../_cinematic/cinematic.module.css";

/**
 * The cinematic shell. Every route in this group renders its own header and
 * footer here rather than through PageWrapper, so it sits outside the
 * `.public-site` cascade in public.css — which is left untouched and still
 * drives every route outside the group. The route group means the URLs are
 * unchanged: this file wraps `/`, and whatever else moves in beside it.
 *
 * Three things live here and nowhere else: the motion root that turns authored
 * motion on, the `.page` element that declares every design token, and the
 * chrome. A page under this layout renders sections and nothing else.
 */
export default function CinematicLayout({ children }: { children: React.ReactNode }) {
  return (
    <MotionRoot>
      <div className={styles.page}>
        {/*
          The header starts transparent over a full-bleed hero and only takes on
          its navy backdrop once SiteHeader sets `data-condensed`. With scripting
          off that never runs, so a fixed header of white text would sit
          unreadable over the homepage's two paper sections. Give it the backdrop
          up front in that case — the only thing lost is the transparent opening,
          and legibility is not negotiable.
        */}
        <noscript>
          <style>{`.${styles.header}{background:var(--ink);box-shadow:0 1px 0 0 rgba(255,255,255,0.14)}`}</style>
        </noscript>

        <a href="#main-content" className={styles.skipLink}>
          Skip to content
        </a>

        <SiteHeader />

        {/*
          This group renders its own document structure instead of PageWrapper's,
          so the main landmark has to be declared here. It is a plain block
          wrapper — no layout property is set on it, so a page's sections lay out
          exactly as if they were top level. `tabIndex={-1}` is what lets the skip
          link move real focus here rather than only the scroll position.
        */}
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>

        <SiteFooter />
      </div>
    </MotionRoot>
  );
}
