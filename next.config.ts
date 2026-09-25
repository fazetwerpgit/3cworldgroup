import type { NextConfig } from "next";

// Short, memorable URLs managers can text to reps. /portal renders the login
// form when signed out and forwards to the dashboard when signed in.
const LOGIN_ALIASES = ['/login', '/signin', '/employee'];

// Pages folded into the Learn and admin hub pages (People, Onboarding, Requests, Admin settings)
// keep their old URLs: bookmarks, and links already stored in notifications and
// emails, land on the right tab. A request's own query string passes through.
const MOVED_PAGES: [source: string, destination: string][] = [
  // Ops Home's queues are on Home now (owner, admin and operations).
  ['/portal/admin', '/portal/dashboard'],
  ['/portal/resources', '/portal/learn?tab=pay'],
  ['/portal/training', '/portal/learn?tab=training'],
  ['/portal/admin/users', '/portal/admin/people?tab=everyone'],
  ['/portal/admin/recruiting', '/portal/admin/onboarding?tab=invites'],
  ['/portal/admin/pipeline', '/portal/admin/onboarding?tab=pipeline'],
  ['/portal/admin/employee-data', '/portal/admin/people?tab=employee-data'],
  ['/portal/admin/employee-import', '/portal/admin/people?tab=employee-data'],
  ['/portal/admin/knowledge', '/portal/admin/people?tab=knowledge'],
  ['/portal/admin/payroll-disputes', '/portal/admin/requests?type=payroll-disputes'],
  ['/portal/admin/expedite-orders', '/portal/admin/requests?type=expedite-orders'],
  ['/portal/admin/leads-requests', '/portal/admin/requests?type=leads-requests'],
  ['/portal/admin/fiber-reports', '/portal/admin/requests?type=fiber-reports'],
  ['/portal/admin/manager-interviews', '/portal/admin/requests?type=manager-interviews'],
  ['/portal/admin/bug-reports', '/portal/admin/requests?type=bug-reports'],
  ['/portal/admin/form-options', '/portal/admin/settings?tab=form-options'],
  ['/portal/admin/chat-channels', '/portal/admin/settings?tab=chat-channels'],
  ['/portal/admin/email-templates', '/portal/admin/settings?tab=email-templates'],
  ['/portal/admin/university', '/portal/admin/settings?tab=university'],
];

const nextConfig: NextConfig = {
  // Kill switches, ONE variable each for both sides: the route reads it, and
  // this inlines it into the client bundle so the page never shows the feature
  // when it is off. Set at build time, so flipping one needs a redeploy (as any
  // Vercel env change does). See src/lib/sales/scan/flag.ts and src/lib/ask/flag.ts.
  env: {
    SALE_SCAN_ENABLED: process.env.SALE_SCAN_ENABLED ?? '',
    ASK_3C_ENABLED: process.env.ASK_3C_ENABLED ?? '',
  },
  // Dev only: lets a phone on the LAN load the dev server through the
  // firewall-forwarded port without Next blocking /_next/* as cross-origin.
  allowedDevOrigins: ['192.168.4.88', '127.0.0.1'],
  outputFileTracingIncludes: {
    '/**': ['assets/esign/**'],
  },
  async redirects() {
    return [
      ...LOGIN_ALIASES.map((source) => ({
        source,
        destination: '/portal',
        permanent: true,
      })),
      // University's old Short videos link: the destination's tab wins over the request's.
      {
        source: '/portal/training',
        has: [{ type: 'query' as const, key: 'tab', value: 'shorts' }],
        destination: '/portal/learn?tab=training&view=shorts',
        permanent: false,
      },
      ...MOVED_PAGES.map(([source, destination]) => ({ source, destination, permanent: false })),
    ];
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '3cworldgroup.com',
        pathname: '/wp-content/uploads/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.pexels.com',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
