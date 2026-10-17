// Apple App Site Association for the 3C Portal iOS app (docs/ios-app/SPEC.md B8).
//
// iOS fetches https://www.3cworldgroup.com/.well-known/apple-app-site-association
// (via Apple's CDN) to verify applinks:www.3cworldgroup.com, so links to
// /portal/* in emails and texts open the app instead of Safari. Apple requires
// a 200 with JSON at this exact path: no redirect, no file extension. A route
// handler (not a public/ file) guarantees the application/json content type.
// proxy.ts only matches /api/portal/*, and no next.config redirect matches here.

import { APPLE_APP_SITE_ASSOCIATION } from '@/lib/app/appleAppSiteAssociation';

export const dynamic = 'force-static';

export function GET(): Response {
  return new Response(JSON.stringify(APPLE_APP_SITE_ASSOCIATION), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
