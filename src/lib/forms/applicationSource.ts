import type { ApplicationChannel, ApplicationSource } from '@/types';

// How an applicant found the site, end to end: the public layout records the
// first touch of a browser session (sessionStorage, no cookie), /apply sends it
// with the application, and the API cleans it and sorts it into a channel for
// the Recruits list.

export const FIRST_TOUCH_KEY = '3c:first-touch';

const MAX_LENGTH = 100;

/** What the browser keeps for the session, before the server has seen it. */
export interface FirstTouch {
  referrerHost: string;
  landingPath: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}

const bareHost = (host: string) => host.toLowerCase().replace(/^www\./, '');

/**
 * The first touch from a referrer and the page it landed on. The referrer is
 * kept to its hostname and dropped when it is this site (an internal click);
 * the landing page is kept to its path, without the query.
 */
export function firstTouchFrom(
  referrer: string,
  location: { hostname: string; pathname: string; search: string }
): FirstTouch {
  let referrerHost = '';
  try {
    referrerHost = referrer ? new URL(referrer).hostname.toLowerCase() : '';
  } catch {
    referrerHost = '';
  }
  if (referrerHost && bareHost(referrerHost) === bareHost(location.hostname)) referrerHost = '';
  const params = new URLSearchParams(location.search);
  const param = (name: string) => (params.get(name) ?? '').trim().slice(0, MAX_LENGTH);
  return {
    referrerHost,
    landingPath: location.pathname.slice(0, MAX_LENGTH),
    utm_source: param('utm_source'),
    utm_medium: param('utm_medium'),
    utm_campaign: param('utm_campaign'),
  };
}

/** Records the first touch once per session; a later page never overwrites it. */
export function recordFirstTouch(): void {
  try {
    if (window.sessionStorage.getItem(FIRST_TOUCH_KEY)) return;
    window.sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify(firstTouchFrom(document.referrer, window.location)));
  } catch {
    // Storage blocked or full: the application falls back to the live referrer.
  }
}

/**
 * The session's first touch for the application. With storage blocked it is
 * read live instead: the referrer is still the one the visit arrived with,
 * though the landing path is then the current page.
 */
export function readFirstTouch(): FirstTouch | null {
  try {
    const stored = window.sessionStorage.getItem(FIRST_TOUCH_KEY);
    if (stored) return JSON.parse(stored) as FirstTouch;
  } catch {
    // Fall through to the live read.
  }
  try {
    return firstTouchFrom(document.referrer, window.location);
  } catch {
    return null;
  }
}

const HOST_PATTERN = /^[a-z0-9.-]+$/;
const PATH_PATTERN = /^\/[A-Za-z0-9/_.~%-]*$/;
const UTM_PATTERN = /^[A-Za-z0-9 _.~+-]+$/;

function cleanField(value: unknown, pattern: RegExp, lower = false): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim().slice(0, MAX_LENGTH);
  const text = lower ? trimmed.toLowerCase() : trimmed;
  return pattern.test(text) ? text : '';
}

const hostIs = (host: string, name: string) => new RegExp(`(^|\\.)${name}\\.`).test(host);

const NAMED_CHANNELS: ApplicationChannel[] = ['google', 'indeed', 'bing', 'facebook', 'instagram', 'tiktok'];

/**
 * The channel, from the referrer first and then the campaign tag. A referrer
 * matches on a whole label, so `news.google.com` and `google.co.uk` are Google
 * and `notgoogle.com` is not. Nothing at all is direct; anything else, other.
 */
export function classifyChannel(source: Omit<ApplicationSource, 'channel' | 'landingPath'>): ApplicationChannel {
  const host = source.referrerHost.toLowerCase();
  if (host) {
    if (hostIs(host, 'google')) return 'google';
    if (hostIs(host, 'indeed')) return 'indeed';
    if (hostIs(host, 'bing')) return 'bing';
    if (hostIs(host, 'facebook') || hostIs(host, 'fb')) return 'facebook';
    if (hostIs(host, 'instagram')) return 'instagram';
    if (hostIs(host, 'tiktok')) return 'tiktok';
  }
  const tag = source.utmSource.toLowerCase();
  const tagged = NAMED_CHANNELS.find((channel) => channel === tag);
  if (tagged) return tagged;
  if (!host && !source.utmSource && !source.utmMedium && !source.utmCampaign) return 'direct';
  return 'other';
}

/**
 * Untrusted input (the public API body) down to a stored source. Each field
 * must look like what it claims to be, or it is dropped; a missing or broken
 * object is simply a direct visit. Never a reason to reject an application.
 */
export function cleanApplicationSource(value: unknown): ApplicationSource {
  const raw = value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const fields = {
    referrerHost: cleanField(raw.referrerHost, HOST_PATTERN, true),
    landingPath: cleanField(raw.landingPath, PATH_PATTERN),
    utmSource: cleanField(raw.utm_source, UTM_PATTERN),
    utmMedium: cleanField(raw.utm_medium, UTM_PATTERN),
    utmCampaign: cleanField(raw.utm_campaign, UTM_PATTERN),
  };
  return { ...fields, channel: classifyChannel(fields) };
}

const CHANNEL_LABELS: Record<ApplicationChannel, string> = {
  google: 'Google',
  indeed: 'Indeed',
  bing: 'Bing',
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  direct: 'Direct',
  other: 'Other',
};

/** A stored source back off a Firestore document; older applications hold the string 'website'. */
export function storedSource(value: unknown): ApplicationSource | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  if (typeof data.channel !== 'string' || !Object.hasOwn(CHANNEL_LABELS, data.channel)) return undefined;
  const text = (field: unknown) => (typeof field === 'string' ? field : '');
  return {
    referrerHost: text(data.referrerHost),
    landingPath: text(data.landingPath),
    utmSource: text(data.utmSource),
    utmMedium: text(data.utmMedium),
    utmCampaign: text(data.utmCampaign),
    channel: data.channel as ApplicationChannel,
  };
}

/** "Google", "Direct", or for other the site or tag that sent them; '' when unknown. */
export function sourceLabel(source: ApplicationSource | undefined): string {
  if (!source) return '';
  if (source.channel === 'other') return source.referrerHost || source.utmSource || CHANNEL_LABELS.other;
  return CHANNEL_LABELS[source.channel];
}
