// A one-event iCalendar file (RFC 5545) for "Add to calendar" attachments.
// METHOD:PUBLISH: the file adds the event to the reader's calendar; it is not
// a meeting invitation that asks for a reply (that would be REQUEST).

export interface IcsEvent {
  /** Globally unique and stable for the event, e.g. "<booking id>@3cworldgroup.com". */
  uid: string;
  /** Instants; written in UTC. */
  start: Date;
  end: Date;
  summary: string;
  location?: string;
  description?: string;
  /** A link for the event (the Meet link); written as URL. */
  url?: string;
  /** When the file was made (DTSTAMP). Defaults to now. */
  stamp?: Date;
}

export const ICS_CONTENT_TYPE = 'text/calendar; charset=utf-8; method=PUBLISH';

const CRLF = '\r\n';
const MAX_OCTETS = 75;

/** TEXT value escaping: backslash, semicolon, comma, and line breaks as \n. */
export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * Folds one content line at 75 octets (UTF-8), never inside a character. Each
 * continuation starts with one space, which counts toward its 75.
 */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let octets = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    const limit = parts.length === 0 ? MAX_OCTETS : MAX_OCTETS - 1;
    if (octets + size > limit) {
      parts.push(current);
      current = '';
      octets = 0;
    }
    current += ch;
    octets += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/** 20261026T150000Z */
export function icsUtc(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

/** A URI value: no TEXT escaping, but never a line break. */
const uri = (value: string) => value.replace(/[\r\n]/g, '');

export function buildIcs(event: IcsEvent): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//3C World Group//Solar Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(event.uid)}`,
    `DTSTAMP:${icsUtc(event.stamp ?? new Date())}`,
    `DTSTART:${icsUtc(event.start)}`,
    `DTEND:${icsUtc(event.end)}`,
    `SUMMARY:${escapeIcsText(event.summary)}`,
    ...(event.location ? [`LOCATION:${escapeIcsText(event.location)}`] : []),
    ...(event.description ? [`DESCRIPTION:${escapeIcsText(event.description)}`] : []),
    ...(event.url ? [`URL:${uri(event.url)}`] : []),
    'STATUS:CONFIRMED',
    'SEQUENCE:0',
    'TRANSP:OPAQUE',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}

/** The file as a sendEmail attachment. */
export function icsAttachment(name: string, ics: string) {
  return { name, contentBase64: Buffer.from(ics, 'utf8').toString('base64'), contentType: ICS_CONTENT_TYPE };
}
