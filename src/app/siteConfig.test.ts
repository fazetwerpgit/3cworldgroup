import { describe, expect, it } from 'vitest';
import nextConfig from '../../next.config';
import robots from './robots';
import sitemap from './sitemap';

describe('robots and sitemap', () => {
  it('lists every public page and no private area', () => {
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual(
      expect.arrayContaining([
        'https://www.3cworldgroup.com',
        'https://www.3cworldgroup.com/about',
        'https://www.3cworldgroup.com/services',
        'https://www.3cworldgroup.com/opportunities',
        'https://www.3cworldgroup.com/apply',
        'https://www.3cworldgroup.com/contact',
        'https://www.3cworldgroup.com/privacy',
        'https://www.3cworldgroup.com/terms',
      ]),
    );
    expect(urls.some((url) => /\/(portal|onboard|api|culture|careers)\b/.test(url))).toBe(false);
  });

  it('keeps crawlers out of the portal, onboarding links and the API', () => {
    const { rules, sitemap: map } = robots();
    expect(rules).toMatchObject({ userAgent: '*', allow: '/', disallow: ['/portal', '/onboard', '/api'] });
    expect(map).toBe('https://www.3cworldgroup.com/sitemap.xml');
  });
});

describe('next.config', () => {
  it('permanently redirects the retired /careers and /culture URLs', async () => {
    const redirects = await nextConfig.redirects!();
    expect(redirects).toEqual(
      expect.arrayContaining([
        { source: '/careers', destination: '/opportunities', permanent: true },
        { source: '/culture', destination: '/about', permanent: true },
      ]),
    );
  });

  it('forbids framing by other sites on every route', async () => {
    const all = (await nextConfig.headers!()).find((rule) => rule.source === '/:path*');
    const headers = Object.fromEntries(all!.headers.map((h) => [h.key, h.value]));
    expect(headers['X-Frame-Options']).toBe('SAMEORIGIN');
    expect(headers['Content-Security-Policy']).toBe("frame-ancestors 'self'");
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Permissions-Policy']).toContain('microphone=(self)');
  });
});
