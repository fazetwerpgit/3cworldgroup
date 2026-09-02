import Link from "next/link";
import Image from "next/image";
import { FaFacebookF, FaInstagram, FaLinkedinIn } from "react-icons/fa6";

const footerGroups = [
  {
    title: "Company",
    links: [
      { href: "/about", label: "About Us" },
      { href: "/about#mission", label: "Our Mission" },
      { href: "/about#leadership", label: "Leadership" },
      { href: "/about#news", label: "News" },
      { href: "/opportunities", label: "Careers" },
    ],
  },
  {
    title: "Services",
    links: [
      { href: "/services#fiber", label: "Fiber Internet" },
      { href: "/services#tv", label: "TV Services" },
      { href: "/services#security", label: "Security Systems" },
      { href: "/services#bundle", label: "Bundle & Save" },
    ],
  },
  {
    title: "Careers",
    links: [
      { href: "/opportunities", label: "Why 3C" },
      { href: "/opportunities", label: "Sales Opportunity" },
      { href: "/opportunities#contractor", label: "Contractor Opportunity" },
      { href: "/apply", label: "Apply Now" },
    ],
  },
  {
    title: "Contact",
    links: [
      { href: "/contact", label: "Contact Us" },
      { href: "/portal", label: "Employee Login" },
      { href: "/opportunities#contractor", label: "Partner With Us" },
    ],
  },
];

const socialLinks = [
  { href: "https://www.linkedin.com/company/3cworldgroup", label: "LinkedIn", Icon: FaLinkedinIn },
  { href: "https://www.facebook.com/3cworldgroup", label: "Facebook", Icon: FaFacebookF },
  { href: "https://www.instagram.com/3cworldgroup", label: "Instagram", Icon: FaInstagram },
] as const;

export default function Footer() {
  return (
    <footer className="public-footer public-topo-surface">
      <div className="public-container">
        <div className="public-footer-grid">
          <div className="public-footer-intro">
            <Link href="/" className="public-footer-brand" aria-label="3C World Group home">
              <Image
                src="/logo.png"
                alt="3C World Group"
                width={550}
                height={516}
                className="public-footer-logo"
                sizes="(min-width: 900px) 52px, 48px"
              />
              <span className="public-footer-wordmark">3C World Group</span>
            </Link>
            <p className="public-footer-tagline">Connecting America</p>
            <p className="public-footer-copy">
              <span>We connect leading service providers </span>
              <span>with communities across the country. </span>
              <span>You’ll represent trusted products, </span>
              <span>build relationships, future.</span>
            </p>
            <div className="public-footer-socials" aria-label="3C World Group social links">
              {socialLinks.map(({ href, label, Icon }) => (
                <a
                  key={label}
                  href={href}
                  className="public-footer-social"
                  aria-label={`3C World Group on ${label}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Icon aria-hidden="true" focusable="false" />
                </a>
              ))}
            </div>
          </div>

          {footerGroups.map((group) => (
            <div key={group.title} className="public-footer-group">
              <h2 className="public-footer-heading">{group.title}</h2>
              <ul className="public-footer-links">
                {group.links.map((link) => (
                  <li key={`${link.href}-${link.label}`}>
                    <Link href={link.href} className="public-footer-link">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="public-footer-bottom">
          <p>© 2025 3C World Group. All rights reserved.</p>
          <div className="public-footer-legal">
            <Link href="/privacy" className="public-footer-legal-link">Privacy Policy</Link>
            <Link href="/terms" className="public-footer-legal-link">Terms of Use</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
