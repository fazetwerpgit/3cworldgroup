import { describe, expect, it } from 'vitest';
import {
  classifyChannel,
  cleanApplicationSource,
  firstTouchFrom,
  sourceLabel,
  storedSource,
} from './applicationSource';

const NONE = { referrerHost: '', utmSource: '', utmMedium: '', utmCampaign: '' };

describe('classifyChannel', () => {
  it.each([
    ['www.google.com', 'google'],
    ['google.co.uk', 'google'],
    ['news.google.com', 'google'],
    ['com.google.android.googlequicksearchbox', 'google'],
    ['www.indeed.com', 'indeed'],
    ['m.indeed.co.uk', 'indeed'],
    ['www.bing.com', 'bing'],
    ['l.facebook.com', 'facebook'],
    ['m.facebook.com', 'facebook'],
    ['fb.me', 'facebook'],
    ['l.instagram.com', 'instagram'],
    ['www.tiktok.com', 'tiktok'],
    ['duckduckgo.com', 'other'],
    ['notgoogle.com', 'other'],
    ['googleads.example', 'other'],
  ])('sorts referrer %s as %s', (referrerHost, channel) => {
    expect(classifyChannel({ ...NONE, referrerHost })).toBe(channel);
  });

  it('is direct with no referrer and no campaign tags', () => {
    expect(classifyChannel(NONE)).toBe('direct');
  });

  it('reads utm_source when there is no telling referrer', () => {
    expect(classifyChannel({ ...NONE, utmSource: 'indeed' })).toBe('indeed');
    expect(classifyChannel({ ...NONE, utmSource: 'Indeed' })).toBe('indeed');
    expect(classifyChannel({ ...NONE, utmSource: 'newsletter' })).toBe('other');
    expect(classifyChannel({ ...NONE, utmMedium: 'email' })).toBe('other');
  });

  it('lets a known referrer win over the tag', () => {
    expect(classifyChannel({ ...NONE, referrerHost: 'www.google.com', utmSource: 'indeed' })).toBe('google');
  });
});

describe('cleanApplicationSource', () => {
  it('keeps well-formed fields and derives the channel', () => {
    expect(
      cleanApplicationSource({
        referrerHost: 'WWW.Indeed.com',
        landingPath: '/opportunities',
        utm_source: 'indeed',
        utm_medium: 'cpc',
        utm_campaign: 'fall_2026 dallas',
      })
    ).toEqual({
      referrerHost: 'www.indeed.com',
      landingPath: '/opportunities',
      utmSource: 'indeed',
      utmMedium: 'cpc',
      utmCampaign: 'fall_2026 dallas',
      channel: 'indeed',
    });
  });

  it('is a direct visit when the source is missing or not an object', () => {
    const direct = { referrerHost: '', landingPath: '', utmSource: '', utmMedium: '', utmCampaign: '', channel: 'direct' };
    for (const value of [undefined, null, 'google', 42, ['www.google.com']]) {
      expect(cleanApplicationSource(value)).toEqual(direct);
    }
  });

  it('drops fields that do not look like what they claim to be', () => {
    const cleaned = cleanApplicationSource({
      referrerHost: 'evil.com/<script>',
      landingPath: 'opportunities?x=1',
      utm_source: '=HYPERLINK("x")',
      utm_medium: { nested: true },
      utm_campaign: 'line\nbreak',
    });
    expect(cleaned).toEqual({
      referrerHost: '',
      landingPath: '',
      utmSource: '',
      utmMedium: '',
      utmCampaign: '',
      channel: 'direct',
    });
  });

  it('caps each field at 100 characters', () => {
    const cleaned = cleanApplicationSource({ landingPath: `/${'a'.repeat(300)}`, utm_campaign: 'b'.repeat(300) });
    expect(cleaned.landingPath).toHaveLength(100);
    expect(cleaned.utmCampaign).toHaveLength(100);
  });
});

describe('firstTouchFrom', () => {
  const location = { hostname: 'www.3cworldgroup.com', pathname: '/opportunities', search: '?utm_source=indeed&utm_medium=cpc&x=1' };

  it('keeps the referrer host, the landing path and the utm tags', () => {
    expect(firstTouchFrom('https://www.google.com/search?q=3c+world+group', location)).toEqual({
      referrerHost: 'www.google.com',
      landingPath: '/opportunities',
      utm_source: 'indeed',
      utm_medium: 'cpc',
      utm_campaign: '',
    });
  });

  it('drops a same-site referrer, with or without www', () => {
    expect(firstTouchFrom('https://3cworldgroup.com/about', location).referrerHost).toBe('');
    expect(firstTouchFrom('https://www.3cworldgroup.com/', location).referrerHost).toBe('');
  });

  it('treats an empty or broken referrer as none', () => {
    expect(firstTouchFrom('', location).referrerHost).toBe('');
    expect(firstTouchFrom('not a url', location).referrerHost).toBe('');
  });
});

describe('storedSource and sourceLabel', () => {
  it('ignores the legacy string source', () => {
    expect(storedSource('website')).toBeUndefined();
    expect(storedSource({ channel: 'toString' })).toBeUndefined();
    expect(sourceLabel(undefined)).toBe('');
  });

  it('labels a named channel, and other by the site that sent them', () => {
    const google = storedSource({ channel: 'google', referrerHost: 'www.google.com' });
    expect(sourceLabel(google)).toBe('Google');
    expect(sourceLabel(storedSource({ channel: 'other', referrerHost: 'duckduckgo.com' }))).toBe('duckduckgo.com');
    expect(sourceLabel(storedSource({ channel: 'other', utmSource: 'newsletter' }))).toBe('newsletter');
    expect(sourceLabel(storedSource({ channel: 'direct' }))).toBe('Direct');
  });
});
