"use client";

import Link from "next/link";
import Image from "next/image";
import { useState, useEffect } from "react";

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Handle scroll effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const navLinks = [
    { href: "/", label: "Home" },
    { href: "/about", label: "About" },
    { href: "/services", label: "Services" },
    { href: "/opportunities", label: "Careers" },
    { href: "/contact", label: "Contact" },
  ];

  return (
    <nav className={`bg-white border-b border-gray-100 sticky top-0 z-50 transition-all duration-300 ${scrolled ? "shadow-md" : ""}`}>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-20">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-3 group">
            <Image
              src="/logo.png"
              alt="3C World Group"
              width={48}
              height={48}
              className="rounded-full group-hover:scale-105 transition-transform"
            />
            <div>
              <span className="text-xl font-bold text-[#0A1F44] block leading-tight">3C World Group</span>
              <span className="text-xs text-gray-500 hidden sm:block">Connecting America</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden lg:flex items-center gap-6">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-gray-700 hover:text-[#6A8FE3] transition-colors font-medium text-[15px] relative group"
              >
                {link.label}
                <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#8dc63f] group-hover:w-full transition-all duration-300"></span>
              </Link>
            ))}
            <Link
              href="/portal"
              className="text-[#0A1F44] hover:text-[#6A8FE3] transition-colors font-medium text-[15px] flex items-center gap-1.5"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Employee Login
            </Link>
            <Link
              href="/apply"
              className="bg-[#8dc63f] text-white px-7 py-3 font-bold hover:bg-[#7ab82e] transition-all shadow-sharp flex items-center gap-2 uppercase tracking-wide text-sm"
            >
              Apply Now
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
              </svg>
            </Link>
          </div>

          {/* Mobile menu button */}
          <div className="lg:hidden flex items-center gap-3">
            <Link
              href="/apply"
              className="bg-[#8dc63f] text-white px-4 py-2 font-bold text-sm hover:bg-[#7ab82e] transition-colors uppercase"
            >
              Apply
            </Link>
            <button
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Toggle menu"
            >
              <svg
                className="w-6 h-6 text-gray-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                {mobileMenuOpen ? (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                ) : (
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 6h16M4 12h16M4 18h16"
                  />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className={`lg:hidden overflow-hidden transition-all duration-300 ${mobileMenuOpen ? "max-h-96 pb-4" : "max-h-0"}`}>
          <div className="pt-2 border-t border-gray-100">
            <div className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-gray-700 hover:text-[#6A8FE3] hover:bg-gray-50 transition-colors font-medium px-4 py-3 rounded-lg"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <Link
                href="/portal"
                className="text-gray-700 hover:text-[#6A8FE3] hover:bg-gray-50 transition-colors font-medium px-4 py-3 rounded-lg flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                Employee Login
              </Link>
              <Link
                href="/apply"
                className="bg-[#8dc63f] text-white px-6 py-3 font-bold text-center mx-2 mt-2 hover:bg-[#7ab82e] transition-colors flex items-center justify-center gap-2 uppercase tracking-wide"
                onClick={() => setMobileMenuOpen(false)}
              >
                Apply Now
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </nav>
  );
}
