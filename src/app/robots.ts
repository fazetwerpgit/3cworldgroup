import type { MetadataRoute } from 'next';
import { SITE_URL } from './_cinematic/nav';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/portal', '/onboard', '/api'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
