import { notFound } from 'next/navigation';

// Any /portal address that matches no page: the portal's own not-found
// (portal/not-found.tsx, on the rep shell) instead of the public site's 404.
export default function PortalMissingPage() {
  notFound();
}
