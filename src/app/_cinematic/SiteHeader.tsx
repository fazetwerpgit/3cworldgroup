"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Menu, X } from "lucide-react";
import { APPLY_HREF, NAV_LINKS } from "./nav";
import styles from "../cinematic-home.module.css";

/**
 * The homepage's own header. It sits inside the page rather than in
 * PageWrapper so it can start transparent over the hero photograph and take on
 * a navy backdrop only once the reader has left the opening frame. Every other
 * route keeps the shared Navbar untouched.
 */
export default function SiteHeader() {
  const [condensed, setCondensed] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const sheetId = useId();

  useEffect(() => {
    const onScroll = () => setCondensed(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

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

  return (
    <header className={styles.header} data-condensed={condensed || undefined} data-open={menuOpen || undefined}>
      <div className={styles.headerRow}>
        <Link href="/" className={styles.brand} aria-label="3C World Group home">
          <Image
            src="/logo.png"
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
            <Link key={link.href} href={link.href} className={styles.headerLink}>
              {link.label}
            </Link>
          ))}
        </nav>

        <div className={styles.headerActions}>
          <Link href={APPLY_HREF} className={`${styles.btn} ${styles.btnLime} ${styles.btnSm}`}>
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
          <Link key={link.href} href={link.href} className={styles.menuLink} onClick={() => setMenuOpen(false)}>
            {link.label}
          </Link>
        ))}
        <Link href={APPLY_HREF} className={styles.menuLinkApply} onClick={() => setMenuOpen(false)}>
          Apply to sell with 3C
        </Link>
      </div>
    </header>
  );
}
