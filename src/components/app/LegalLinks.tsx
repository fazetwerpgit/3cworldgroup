import Link from 'next/link';
import l from './legal-links.module.css';

export const PRIVACY_HREF = '/privacy';
export const TERMS_HREF = '/terms';

/**
 * Privacy Policy and Terms of Service, one tap from inside the portal (App
 * Store guideline 5.1.1(i): the policy must be easy to reach in the app). Both
 * pages open in the app's WebView with a back button to the portal.
 */
export function LegalLinks({ className }: { className?: string }) {
  return (
    <nav aria-label="Legal" className={className ? `${l.links} ${className}` : l.links}>
      <Link href={PRIVACY_HREF} className={l.link}>
        Privacy Policy
      </Link>
      <Link href={TERMS_HREF} className={l.link}>
        Terms of Service
      </Link>
    </nav>
  );
}
