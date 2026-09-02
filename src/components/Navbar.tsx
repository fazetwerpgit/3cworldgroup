"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ArrowRight, Menu, UserRound, X } from "lucide-react";

const innerNavLinks = [
  { href: "/", label: "Home" },
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/opportunities", label: "Careers" },
  { href: "/contact", label: "Contact" },
];

const homeNavLinks = [
  { href: "/opportunities", label: "Open Markets" },
  { href: "/services", label: "The Work" },
  { href: "/opportunities#how-it-works", label: "Growth Path" },
  { href: "/opportunities#contractor", label: "Contractor Teams" },
  { href: "/contact", label: "FAQ" },
];

function isActivePath(pathname: string, href: string) {
  const route = href.split("#", 1)[0];
  if (route === "/") return pathname === "/";
  return pathname === route || pathname.startsWith(`${route}/`);
}

export default function Navbar() {
  const pathname = usePathname() ?? "/";
  const navLinks = pathname === "/" ? homeNavLinks : innerNavLinks;
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 12);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  return (
    <header className={`public-nav ${scrolled ? "is-scrolled" : ""}`}>
      <div className="public-container">
        <div className="public-nav-row">
          <Link
            href="/"
            className="public-brand"
            aria-label="3C World Group home"
          >
            <Image
              src="/logo.png"
              alt="3C World Group"
              width={550}
              height={516}
              className="public-brand-logo"
              sizes="(min-width: 1000px) 76px, (min-width: 721px) 46px, 42px"
              priority
            />
            <span className="public-brand-copy">
              <span className="public-brand-name">3C World Group</span>
              <span className="public-brand-tagline">Connecting America</span>
            </span>
          </Link>

          <nav className="public-desktop-nav" aria-label="Primary navigation">
            {navLinks.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
                  className={`public-nav-link ${active ? "is-active" : ""}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link href="/portal" className="public-nav-login">
              <UserRound aria-hidden="true" size={20} strokeWidth={1.8} />
              Employee Login
            </Link>
            <Link
              href="/apply"
              aria-current={isActivePath(pathname, "/apply") ? "page" : undefined}
              className={`public-button public-button-lime public-nav-apply ${isActivePath(pathname, "/apply") ? "is-active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Apply Now
              <ArrowRight aria-hidden="true" size={17} strokeWidth={2.2} />
            </Link>
          </nav>

          <div className="public-mobile-actions">
            <Link
              href="/apply"
              aria-current={isActivePath(pathname, "/apply") ? "page" : undefined}
              className={`public-button public-button-lime public-mobile-apply ${isActivePath(pathname, "/apply") ? "is-active" : ""}`}
              onClick={() => setMobileMenuOpen(false)}
            >
              Apply Now
              <ArrowRight aria-hidden="true" size={16} strokeWidth={2.2} />
            </Link>
            <button
              type="button"
              className="public-icon-button"
              onClick={() => setMobileMenuOpen((open) => !open)}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-public-navigation"
              aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
            >
              {mobileMenuOpen ? (
                <X aria-hidden="true" size={23} strokeWidth={1.8} />
              ) : (
                <Menu aria-hidden="true" size={23} strokeWidth={1.8} />
              )}
            </button>
          </div>
        </div>

        <div
          id="mobile-public-navigation"
          className={`public-mobile-nav-shell ${mobileMenuOpen ? "is-open" : ""}`}
          aria-hidden={!mobileMenuOpen}
        >
          <nav className="public-mobile-nav" aria-label="Mobile navigation">
            {navLinks.map((link) => {
              const active = isActivePath(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  aria-current={isActivePath(pathname, link.href) ? "page" : undefined}
                  tabIndex={mobileMenuOpen ? 0 : -1}
                  className={`public-mobile-link ${active ? "is-active" : ""}`}
                >
                  {link.label}
                </Link>
              );
            })}
            <Link
              href="/portal"
              onClick={() => setMobileMenuOpen(false)}
              tabIndex={mobileMenuOpen ? 0 : -1}
              className="public-mobile-link public-mobile-login"
            >
              <UserRound aria-hidden="true" size={18} strokeWidth={1.8} />
              Employee Login
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
