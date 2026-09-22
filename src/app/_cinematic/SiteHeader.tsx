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
  /*
    The sheet remembers which route it was opened on and is open only while the
    reader is still there, so a route change closes it with no effect and no
    reset. Without that, a tap on a sheet link landed on /apply with the sheet
    still covering the hero, and Back brought the reader home with it still
    open. The route changing is the one signal that is true for every way out
    of the sheet: a sheet link, the header row Apply, the logo, Back, Forward.
  */
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const menuOpen = openedOn === pathname;
  const setMenuOpen = (next: boolean | ((open: boolean) => boolean)) => {
    const resolved = typeof next === "function" ? next(menuOpen) : next;
    setOpenedOn(resolved ? pathname : null);
  };
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
      setOpenedOn(null);
      toggleRef.current?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [menuOpen]);

  /*
    The sheet is an overlay, so the page behind it must not scroll under the
    reader's thumb. Restores whatever `overflow` the document had, including on
    unmount, so a navigation that tears the header down cannot leave the body
    locked.
  */
  useEffect(() => {
    if (!menuOpen) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = "hidden";
    return () => {
      body.style.overflow = previous;
    };
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
            /*
              No `priority` and no `loading="eager"`. Either one makes
              `next/image` emit a preload link — the component gates the
              preload on "not lazy", not on `priority` alone — and a 44px logo
              being fetched ahead of the full-bleed photograph that is the
              page's LCP is the wrong order. It is in the viewport at the top
              of every route, so the lazy loader requests it on the first pass
              anyway; measured, it decodes well before the hero does.
            */
            sizes="44px"
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
          {/*
            This link stays visible with the sheet open, so it needs the same
            close handler the sheet's own links carry — the pathname reset below
            covers a real navigation, but tapping Apply while already on /apply
            changes no route and would otherwise leave the sheet up.
          */}
          <Link
            href={APPLY_HREF}
            aria-current={pathname === APPLY_HREF ? "page" : undefined}
            className={`${styles.btn} ${styles.btnLime} ${styles.btnSm}`}
            onClick={() => setMenuOpen(false)}
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
