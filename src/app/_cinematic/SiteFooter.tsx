import Image from "next/image";
import Link from "next/link";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa6";
import { APPLY_HREF, NAV_LINKS } from "./nav";
import styles from "./cinematic.module.css";

/**
 * One slim band, the same on every route in the group: logo and wordmark, a
 * single row of real links, three social icons, and the legal line. No column
 * directory — the site is not big enough to need one and a directory would be
 * the loudest thing on the page.
 *
 * On small screens the homepage's compact apply bar sits over the bottom of the
 * viewport. The footer reserves matching space for it, but only on a page that
 * actually renders one; see `.page:has([data-apply-bar])` in the kit.
 */
export default function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.footerRow}>
        <Link href="/" className={styles.footerBrand} aria-label="3C World Group home">
          <Image src="/logo.webp" alt="" width={550} height={516} className={styles.footerMark} sizes="34px" />
          <span>3C World Group</span>
        </Link>

        <nav className={styles.footerNav} aria-label="Footer">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href}>
              {link.label}
            </Link>
          ))}
          <Link href={APPLY_HREF}>Apply</Link>
          <Link href="/portal">Employee login</Link>
        </nav>

        <div className={styles.footerSocial}>
          <a href="https://www.linkedin.com/company/3cworldgroup" aria-label="3C World Group on LinkedIn">
            <FaLinkedinIn aria-hidden="true" />
          </a>
          <a href="https://www.facebook.com/3cworldgroup" aria-label="3C World Group on Facebook">
            <FaFacebookF aria-hidden="true" />
          </a>
          <a href="https://www.instagram.com/3cworldgroup" aria-label="3C World Group on Instagram">
            <FaInstagram aria-hidden="true" />
          </a>
        </div>
      </div>

      <div className={styles.footerLegal}>
        <p>© {new Date().getFullYear()} 3C World Group. Sales roles are 1099 independent contractor positions.</p>
        <p>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </p>
      </div>
    </footer>
  );
}
