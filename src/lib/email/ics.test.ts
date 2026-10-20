import { describe, expect, it } from 'vitest';
import { ICS_CONTENT_TYPE, buildIcs, escapeIcsText, foldIcsLine, icsAttachment, icsUtc } from './ics';

/** RFC 5545 unfolding: a CRLF followed by one space or tab joins the lines. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, '');
const octets = (s: string) => new TextEncoder().encode(s).length;

describe('escapeIcsText', () => {
  it('escapes backslash, semicolon, comma and every kind of line break', () => {
    expect(escapeIcsText('a\\b;c,d\ne\r\nf\rg')).toBe('a\\\\b\\;c\\,d\\ne\\nf\\ng');
  });

  it('leaves colons and plain text alone', () => {
    expect(escapeIcsText('Join: https://meet.google.com/abc-defg-hij')).toBe('Join: https://meet.google.com/abc-defg-hij');
  });
});

describe('foldIcsLine', () => {
  it('leaves a 75-octet line whole', () => {
    const line = 'X'.repeat(75);
    expect(foldIcsLine(line)).toBe(line);
  });

  it('folds longer lines at 75 octets, each continuation starting with a space', () => {
    const line = `DESCRIPTION:${'a'.repeat(200)}`;
    const folded = foldIcsLine(line);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(2);
    for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(75);
    expect(parts.slice(1).every((p) => p.startsWith(' '))).toBe(true);
    expect(octets(parts[0])).toBe(75);
    expect(unfold(folded)).toBe(line);
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'é'.repeat(60)}${'😀'.repeat(20)}`;
    const folded = foldIcsLine(line);
    for (const part of folded.split('\r\n')) {
      expect(octets(part)).toBeLessThanOrEqual(75);
      expect(part).not.toContain('�');
    }
    expect(unfold(folded)).toBe(line);
  });
});

describe('buildIcs', () => {
  const event = {
    uid: 'own_2026-10-26T15:00:00.000Z@3cworldgroup.com',
    start: new Date('2026-10-26T15:00:00.000Z'),
    end: new Date('2026-10-26T16:00:00.000Z'),
    summary: 'Solar consultation with Sam Closer, Jr.; 3C',
    location: '12 Elm St, Austin, TX',
    description: `Line one, with comma\nLine two; with semicolon\n${'long '.repeat(40)}`,
    url: 'https://meet.google.com/abc-defg-hij',
    stamp: new Date('2026-10-20T00:00:00.000Z'),
  };
  const ics = buildIcs(event);

  it('uses CRLF everywhere and ends with one', () => {
    expect(ics.endsWith('\r\n')).toBe(true);
    expect(ics.replace(/\r\n/g, '')).not.toMatch(/[\r\n]/);
  });

  it('keeps every physical line within 75 octets', () => {
    for (const line of ics.split('\r\n')) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it('is a PUBLISH calendar with one UTC event', () => {
    const lines = unfold(ics).trimEnd().split('\r\n');
    expect(lines[0]).toBe('BEGIN:VCALENDAR');
    expect(lines.at(-1)).toBe('END:VCALENDAR');
    expect(lines).toContain('VERSION:2.0');
    expect(lines).toContain('METHOD:PUBLISH');
    expect(lines.filter((l) => l === 'BEGIN:VEVENT')).toHaveLength(1);
    expect(lines).toContain('UID:own_2026-10-26T15:00:00.000Z@3cworldgroup.com');
    expect(lines).toContain('DTSTART:20261026T150000Z');
    expect(lines).toContain('DTEND:20261026T160000Z');
    expect(lines).toContain('DTSTAMP:20261020T000000Z');
    expect(lines).toContain('SUMMARY:Solar consultation with Sam Closer\\, Jr.\\; 3C');
    expect(lines).toContain('LOCATION:12 Elm St\\, Austin\\, TX');
    expect(lines).toContain('URL:https://meet.google.com/abc-defg-hij');
    const description = lines.find((l) => l.startsWith('DESCRIPTION:'))!;
    expect(description).toContain('Line one\\, with comma\\nLine two\\; with semicolon\\n');
  });

  it('leaves out LOCATION, DESCRIPTION and URL when empty', () => {
    const bare = buildIcs({ uid: 'x@y', start: event.start, end: event.end, summary: 'S' });
    expect(bare).not.toMatch(/LOCATION|DESCRIPTION|URL/);
  });

  it('formats UTC stamps', () => {
    expect(icsUtc(new Date('2026-01-02T03:04:05.678Z'))).toBe('20260102T030405Z');
  });

  it('packs as a base64 text/calendar attachment', () => {
    const a = icsAttachment('invite.ics', ics);
    expect(a.contentType).toBe(ICS_CONTENT_TYPE);
    expect(a.contentType).toBe('text/calendar; charset=utf-8; method=PUBLISH');
    expect(Buffer.from(a.contentBase64, 'base64').toString('utf8')).toBe(ics);
  });
});
