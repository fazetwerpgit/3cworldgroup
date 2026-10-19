import type { Metadata } from 'next';
import PortalNotFound from '@/components/portal/PortalNotFound';

export const metadata: Metadata = {
  title: 'Page not found | 3C World Group',
};

/** A /portal address with no page: answered inside the portal, on the rep shell. */
export default function NotFound() {
  return <PortalNotFound />;
}
