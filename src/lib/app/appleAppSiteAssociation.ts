// Apple App Site Association for the 3C Portal iOS app (docs/ios-app/SPEC.md B8).
// Served by src/app/.well-known/apple-app-site-association/route.ts.

/** <Apple Team ID>.<bundle id> of the 3C Portal app. */
export const APPLE_APP_ID = 'LACS23L8MN.com.threecworldgroup.portal';

export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: [APPLE_APP_ID],
        components: [{ '/': '/portal/*', comment: 'Portal pages open in the 3C Portal app.' }],
      },
    ],
  },
} as const;
