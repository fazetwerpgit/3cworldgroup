"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { APPLY_HREF, NAV_LINKS } from "./nav";
import styles from "./cinematic.module.css";

/**
 * The (cinematic) group's header. It lives in the group layout rather than in
 * PageWrapper so it can start transparent over a full-bleed photograph and take
 * on its navy backdrop only once the reader has left the opening frame. Every
 * route outside the group keeps the shared Navbar untouched.
 *
 * Only the homepage has that photograph. An interior page opens on `.pageHead`,
 * a flat navy band, where a transparent header would be transparent over
 * nothing — so the condense state is simply on from the first paint and the
 * scroll listener is never attached. The page declares which it is by whether
 * it renders a `[data-hero]` element, so no route list has to be kept in sync.
 */
export default function SiteHeader() {
  const pathname = usePathname();
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();

  // Keyed on the pathname, not just on mount: the layout persists across client
  // navigations inside the group, so leaving the homepage for an interior page
  // has to re-decide this or the header keeps the hero's behaviour on a page
  // with no hero.
  useEffect(() => {
    const hero = document.querySelector("[data-hero]");
    const sync = () => setCondensed(!hero || window.scrollY > 24);
    sync();
    // With no hero the answer can never change, so there is nothing to listen to.
    if (!hero) return;
    window.addEventListener("scroll", sync, { passive: true });
    return () => window.removeEventListener("scroll", sync);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuOpen(false);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  const isCurrent = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <header className={styles.header} data-condensed={condensed || undefined} data-open={menuOpen || undefined}>
      <div className={styles.headerRow}>
        {/*
          A2 — the homepage has no "Home" text link, so without this the one
          route on the site with no current-page cue at all was `/`. The logo
          is the link that goes there, so it is the link that carries it.
        */}
        <Link
          href="/"
          className={styles.brand}
          aria-label="3C World Group home"
          aria-current={pathname === "/" ? "page" : undefined}
        >
          <Image
            src="/logo.webp"
            alt=""
            width={550}
            height={516}
            className={styles.brandMark}
            sizes="44px"
            priority
          />
          <span className={styles.brandCopy}>
            <span className={styles.brandName}>3C World Group</span>
            <span className={styles.brandTag}>Connecting America</span>
          </span>
        </Link>

        <nav className={styles.headerNav} aria-label="Primary">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                isCurrent(link.href) ? `${styles.headerLink} ${styles.headerLinkCurrent}` : styles.headerLink
              }
              aria-current={isCurrent(link.href) ? "page" : undefined}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link
            href={APPLY_HREF}
            aria-current={pathname === APPLY_HREF ? "page" : undefined}
            className={`${styles.btn} ${styles.btnLime} ${styles.btnSm}`}
          >
            Apply
          </Link>
          <button
            ref={toggleRef}
            type="button"
            className={styles.menuToggle}
            aria-expanded={menuOpen}
            aria-controls={sheetId}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X aria-hidden="true" size={20} strokeWidth={2} /> : <Menu aria-hidden="true" size={20} strokeWidth={2} />}
            <span className={styles.srOnly}>{menuOpen ? "Close menu" : "Open menu"}</span>
          </button>
        </div>
      </div>

      <div id={sheetId} className={styles.menuSheet} hidden={!menuOpen}>
        {NAV_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={isCurrent(link.href) ? `${styles.menuLink} ${styles.menuLinkCurrent}` : styles.menuLink}
            aria-current={isCurrent(link.href) ? "page" : undefined}
            onClick={() => setMenuOpen(false)}
          >
            {link.label}
          </Link>
        ))}
        <Link
          href={APPLY_HREF}
          aria-current={pathname === APPLY_HREF ? "page" : undefined}
          className={styles.menuLinkApply}
          onClick={() => setMenuOpen(false)}
        >
          Apply to sell with 3C
        </Link>
      </div>
    </header>
  );
}
