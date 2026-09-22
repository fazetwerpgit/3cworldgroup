import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight } from "lucide-react";
import CinematicLayout from "./(cinematic)/layout";
import { APPLY_HREF } from "./_cinematic/nav";
import kit from "./_cinematic/cinematic.module.css";
import styles from "./not-found.module.css";

export const metadata: Metadata = {
  title: "Page not found | 3C World Group",
  description: "That address does not match a page on the 3C World Group site.",
};

/**
 * The 404, in the cinematic language. A mistyped address used to land on the
 * framework's own black-and-white notice: no header, no footer, no way onward,
 * and a title that named Next.js rather than the company.
 *
 * It lives at the app root rather than inside the (cinematic) group because
 * that is the only `not-found` Next renders for an address that matches no
 * route at all — a group's own `not-found` only answers a `notFound()` thrown
 * inside that group, and nothing in this app throws one. Measured, not assumed:
 * the same file under (cinematic) left /nope on the framework default.
 *
 * Sitting at the root means the group layout does not wrap it, so the chrome is
 * brought in by rendering that layout as the component it already is. Importing
 * it beats copying the shell: the motion boot script, the noscript header
 * backdrop and the skip link are all subtle enough that a second copy would
 * drift from the first within a round.
 *
 * It uses `pageHeadFlat` — the head without a photograph, the one the two legal
 * routes use — because this page has no picture of its own, and inventing one
 * for an error would give the site its only decorative image.
 */
export default function NotFound() {
  return (
    <CinematicLayout>
      <header className={`${kit.pageHeadFlat} ${styles.fill}`}>
        <div className={kit.shell}>
          <p className={kit.pageHeadEyebrow}>404</p>
          <h1 className={kit.pageHeadTitle}>That page is not here.</h1>
          <p className={kit.pageHeadLede}>
            The address does not match a page on this site. The link may be old,
            or it may have a typo in it.
          </p>

          {/* Three places worth going, as quiet links rather than three lime
              buttons: an error page asking three times is the page shouting. */}
          <nav className={styles.links} aria-label="Where to go next">
            <Link href="/" className={kit.quietLink}>
              Home
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
            </Link>
            <Link href={APPLY_HREF} className={kit.quietLink}>
              Apply
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
            </Link>
            <Link href="/contact" className={kit.quietLink}>
              Contact
              <ArrowRight aria-hidden="true" className={kit.btnArrow} size={16} strokeWidth={2.2} />
            </Link>
          </nav>
        </div>
      </header>
    </CinematicLayout>
  );
}
