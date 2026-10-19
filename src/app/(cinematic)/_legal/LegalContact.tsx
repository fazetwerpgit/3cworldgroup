"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useIsNativeApp } from "@/lib/app/isNativeApp";

/** The address the legal pages' Contact Us sections give. */
export const LEGAL_CONTACT_EMAIL = "privacy@3cworldgroup.com";

/*
 * The /contact links on /privacy and /terms. Inside the 3C iOS app those pages
 * drop the public header for AppLegalBar, but /contact has no such frame: it
 * would load the marketing site in the WebView under the notch with no way back
 * to the portal. So in the app the contact-form line goes away (the email line
 * above it stays) and the button opens Mail instead. Unchanged in a browser.
 */

/** The "Contact form" list item, or nothing inside the app. */
export function LegalContactFormItem({ linkClassName }: { linkClassName?: string }) {
  const inApp = useIsNativeApp();
  if (inApp) return null;
  return (
    <li>
      <strong>Contact form:</strong>{" "}
      <Link href="/contact" className={linkClassName}>
        3cworldgroup.com/contact
      </Link>
    </li>
  );
}

/** The closing Contact Us button: /contact in a browser, a mailto: inside the app. */
export function LegalContactButton({ className, arrowClassName }: { className?: string; arrowClassName?: string }) {
  const inApp = useIsNativeApp();
  const arrow = <ArrowRight aria-hidden="true" className={arrowClassName} size={16} strokeWidth={2.2} />;
  if (inApp) {
    return (
      <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={className}>
        Email Us
        {arrow}
      </a>
    );
  }
  return (
    <Link href="/contact" className={className}>
      Contact Us
      {arrow}
    </Link>
  );
}
