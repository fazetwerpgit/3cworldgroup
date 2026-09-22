import type { NextConfig } from "next";

// Short, memorable URLs managers can text to reps. /portal renders the login
// form when signed out and forwards to the dashboard when signed in.
const LOGIN_ALIASES = ['/login', '/signin', '/employee'];

const nextConfig: NextConfig = {
  // Dev only: lets a phone on the LAN load the dev server through the
  // firewall-forwarded port without Next blocking /_next/* as cross-origin.
  allowedDevOrigins: ['192.168.4.88', '127.0.0.1'],
  outputFileTracingIncludes: {
    '/**': ['assets/esign/**'],
  },
  async redirects() {
    return LOGIN_ALIASES.map((source) => ({
      source,
      destination: '/portal',
      permanent: true,
    }));
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
