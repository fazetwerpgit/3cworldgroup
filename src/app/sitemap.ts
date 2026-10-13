import type { MetadataRoute } from 'next';
import { PUBLIC_PATHS, SITE_URL } from './_cinematic/nav';

// The sitemap is generated at build, and a deploy is when these pages change,
// so the build time is their honest last-modified date. A page with its own
// date (a per-city page, say) can set `lastModified` on its own entry instead.
const BUILT_AT = new Date();

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.map((path) => ({
    url: path === '/' ? SITE_URL : `${SITE_URL}${path}`,
    lastModified: BUILT_AT,
  }));
}
