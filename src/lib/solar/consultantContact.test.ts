import { describe, expect, it } from 'vitest';
import {
  MEET_LINK_ERROR,
  PHONE_ERROR,
  firstName,
  normalizeConsultantPhone,
  normalizeMeetLink,
  parseConsultantContact,
} from './consultantContact';

const MEET = 'https://meet.google.com/abc-defg-hij';

describe('normalizeMeetLink', () => {
  it.each([
    [MEET],
    ['meet.google.com/abc-defg-hij'],
    ['  https://MEET.Google.com/ABC-DEFG-HIJ  '],
    ['http://meet.google.com/abc-defg-hij'],
    ['https://meet.google.com/abc-defg-hij/'],
    ['https://meet.google.com/abc-defg-hij?authuser=0&pli=1'],
    ['https://meet.google.com/abc-defg-hij#x'],
    ['meet.google.com/abcdefghij'],
  ])('accepts %s', (input) => {
    expect(normalizeMeetLink(input)).toEqual({ ok: true, value: MEET });
  });

  it.each([
    ['https://zoom.us/j/123456'],
    ['https://meet.google.com.evil.com/abc-defg-hij'],
    ['https://evil.com/meet.google.com/abc-defg-hij'],
    ['https://user@meet.google.com/abc-defg-hij'],
    ['https://meet.google.com:8443/abc-defg-hij'],
    ['https://meet.google.com/'],
    ['https://meet.google.com/lookup/abcdef'],
    ['https://meet.google.com/abc-defg-hij/extra'],
    ['https://meet.google.com/ab1-defg-hij'],
    ['ftp://meet.google.com/abc-defg-hij'],
    ['javascript:alert(1)'],
    ['meet.google.com/abc defg hij'],
    ['not a link'],
  ])('refuses %s', (input) => {
    expect(normalizeMeetLink(input)).toEqual({ ok: false, error: MEET_LINK_ERROR });
  });

  it('reads blank as no link and refuses non-strings', () => {
    expect(normalizeMeetLink('   ')).toEqual({ ok: true, value: '' });
    expect(normalizeMeetLink(null)).toEqual({ ok: true, value: '' });
    expect(normalizeMeetLink(42)).toEqual({ ok: false, error: MEET_LINK_ERROR });
  });
});

describe('normalizeConsultantPhone', () => {
  it.each([
    ['(512) 555-0142', '+15125550142'],
    ['512.555.0142', '+15125550142'],
    ['5125550142', '+15125550142'],
    ['1 512 555 0142', '+15125550142'],
    ['+1 (512) 555-0142', '+15125550142'],
    ['+44 20 7946 0958', '+442079460958'],
  ])('stores %s as %s', (input, value) => {
    expect(normalizeConsultantPhone(input)).toEqual({ ok: true, value });
  });

  it.each([['555-0142'], ['(012) 555-0142'], ['(512) 155-0142'], ['512-555-0142 ext 4'], ['call me'], ['+0 123 4567 89'], ['+1 23']])(
    'refuses %s',
    (input) => {
      expect(normalizeConsultantPhone(input)).toEqual({ ok: false, error: PHONE_ERROR });
    }
  );

  it('reads blank as no phone', () => {
    expect(normalizeConsultantPhone('')).toEqual({ ok: true, value: '' });
  });
});

describe('parseConsultantContact', () => {
  it('leaves out keys the body does not carry', () => {
    expect(parseConsultantContact({ tz: 'x' })).toEqual({ ok: true, value: {} });
  });

  it('clears on empty or null', () => {
    expect(parseConsultantContact({ meetLink: '', phone: null })).toEqual({ ok: true, value: { meetLink: '', phone: '' } });
  });

  it('names the bad field', () => {
    expect(parseConsultantContact({ meetLink: MEET, phone: 'nope' })).toEqual({ ok: false, error: PHONE_ERROR, field: 'phone' });
    expect(parseConsultantContact({ meetLink: 'https://x.com' })).toMatchObject({ ok: false, field: 'meetLink' });
  });
});

describe('firstName', () => {
  it('takes the first word', () => {
    expect(firstName('  Sam   Closer ')).toBe('Sam');
    expect(firstName('Jeremy')).toBe('Jeremy');
    expect(firstName('')).toBe('');
  });
});
