// The real public routes, in the order the existing site uses them. Kept in one
// place so the header, the mobile sheet and the footer can never drift apart.
export const NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/services", label: "Services" },
  { href: "/opportunities", label: "Careers" },
  { href: "/contact", label: "Contact" },
] as const;

export const APPLY_HREF = "/apply";
