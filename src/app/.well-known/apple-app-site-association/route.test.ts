import { describe, expect, it } from 'vitest';
import nextConfig from '../../../../next.config';
import { config as proxyConfig } from '../../../proxy';
import { APPLE_APP_ID } from '@/lib/app/appleAppSiteAssociation';
import { GET } from './route';

const PATH = '/.well-known/apple-app-site-association';

describe('apple-app-site-association', () => {
  it('serves the applinks JSON for the iOS app with a 200 and application/json', async () => {
    const res = GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({
      applinks: {
        details: [
          {
            appIDs: ['LACS23L8MN.com.threecworldgroup.portal'],
            components: [{ '/': '/portal/*', comment: expect.any(String) }],
          },
        ],
      },
    });
    expect(APPLE_APP_ID).toBe('LACS23L8MN.com.threecworldgroup.portal');
  });

  it('is not caught by a redirect or the proxy', async () => {
    const redirects = (await nextConfig.redirects?.()) ?? [];
    const sources = redirects.map((r) => r.source);
    expect(sources.some((s) => s === PATH || s.startsWith('/.well-known') || s === '/:path*')).toBe(false);
    const matchers = ([] as string[]).concat(proxyConfig.matcher);
    expect(matchers.every((m) => m.startsWith('/api/'))).toBe(true);
  });
});
