import MotionRoot from "../_cinematic/MotionRoot";
import SiteHeader from "../_cinematic/SiteHeader";
import SiteFooter from "../_cinematic/SiteFooter";
import styles from "../_cinematic/cinematic.module.css";

/*
  The motion gate, opened before the first paint.

  Every pre-reveal style in this group is written behind `[data-motion="on"]`,
  and MotionRoot used to be the thing that set it — in an effect, after
  hydration. On a cold load that is invisible, because hydration beats the
  photograph. On a warm cache it is not: the hero painted fully readable for
  about 170ms, then snapped hidden for two frames and animated back in. A
  content-then-hide flicker on every repeat visit.

  So the attribute is set here instead, by a blocking inline script that the
  parser runs before it reaches the hero markup, which makes the pre-reveal
  state the first thing painted. It goes on documentElement because that is the
  only element that already exists at this point in the parse. MotionRoot still
  owns the attribute's lifecycle — the reduced-motion toggle, the per-pathname
  re-wire, the teardown — it simply no longer owns its first frame.

  The two conditions are exactly MotionRoot's own. With scripting off the
  attribute is never set and the server's finished page is what you get, which
  is the whole reason the gate is written this way round.

  The timer is a safety net, not choreography. This script can hide things but
  it cannot reveal them: `data-entered` and each section's `data-shown` are
  MotionRoot's to write. So if hydration never arrives — a chunk that 404s, a
  throw in another component, or simply a slow phone — everything the gate hid
  would stay hidden for the whole visit. `data-entered` is the proof React got
  here, and hidden copy is a worse failure than a missed entrance, so if that
  proof has not appeared in 1.5s the gate closes itself and the page snaps to
  the finished state it was served in.

  Bailing out has to be final, and `data-motion-bailed` is what makes it so.
  Removing the attribute alone was not enough: hydration that arrives late still
  arrives, and MotionRoot would then set `data-motion` again and hide copy the
  reader had been looking at for a second. Measured on a throttled phone, the
  hero was readable for 1.16s and then vanished. So the timer leaves this flag
  behind, MotionRoot reads it and takes its static path for the life of the
  document, and the page never gates twice. What is lost is the entrance, on a
  load already too slow to have one.
*/
const MOTION_BOOT = `try{if(!matchMedia("(prefers-reduced-motion: reduce)").matches&&"IntersectionObserver" in window){var d=document.documentElement;d.dataset.motion="on";setTimeout(function(){if(!d.dataset.entered){delete d.dataset.motion;d.dataset.motionBailed="true"}},1500)}}catch(e){}`;

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
      {/* Must stay above .page: it has to run before the hero is parsed. */}
      <script dangerouslySetInnerHTML={{ __html: MOTION_BOOT }} />

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
