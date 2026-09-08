import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import { DOCUMENTS, boxToPdfRect, type EsignFieldValues, type PdfRect } from './documents';
import type { EsignDocKey } from './provider';

/**
 * Server-side PDF stamping for the in-house e-sign provider: draws the rep's
 * answers, signature image, and sign date onto the blank source document, then
 * appends one audit page recording how and when it was signed.
 *
 * Sensitive values pass through here on their way into the PDF and must never
 * be logged, so nothing in this module writes field values anywhere else.
 */

export interface StampAudit {
  envelopeId: string;
  signerName: string;
  signerEmail: string;
  userId: string;
  consentText: string;
  consentAt: Date;
  ip: string;
  userAgent: string;
  signatureMethod: 'draw' | 'type';
}

export interface StampInput {
  docKey: EsignDocKey;
  fields: EsignFieldValues;
  signaturePng: Buffer;
  signedAt: Date;
  audit: StampAudit;
}

export interface StampResult {
  pdf: Buffer;
  sourceSha256: string;
  /** Hash of the stamped document *before* the audit page, which prints it. */
  stampedSha256: string;
  pageCount: number;
}

export function sha256Hex(bytes: Uint8Array | Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** MM/DD/YYYY in America/Chicago, the company's operating timezone. */
export function formatSignDate(d: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: '2-digit',
    day: '2-digit',
    year: 'numeric',
  }).format(d);
}

const MAX_FIELD_FONT_SIZE = 11;
const MIN_FIELD_FONT_SIZE = 6;
const FIELD_PADDING = 2;

const AUDIT_PAGE_SIZE: [number, number] = [612, 792];
const AUDIT_MARGIN = 48;
const AUDIT_FONT_SIZE = 10;
const AUDIT_LEADING = 14;
const AUDIT_TOP = 740;

/**
 * The standard fonts are WinAnsi-encoded and pdf-lib throws on anything they
 * cannot represent. Rep-typed values (and user-agent strings) can contain smart
 * quotes or emoji, so unsupported characters become '?' rather than a 500.
 */
function toWinAnsi(text: string): string {
  return text
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, '-')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, '?');
}

/** Largest size at or below 11pt that fits the box, floored at 6pt. */
function fitFontSize(font: PDFFont, text: string, rect: PdfRect): number {
  let size = Math.min(MAX_FIELD_FONT_SIZE, rect.height * 0.7);
  const maxWidth = rect.width - FIELD_PADDING * 2;
  while (size > MIN_FIELD_FONT_SIZE && font.widthOfTextAtSize(text, size) > maxWidth) {
    size -= 0.5;
  }
  return size;
}

function drawFieldText(page: PDFPage, font: PDFFont, value: string, rect: PdfRect): void {
  const text = toWinAnsi(value);
  if (!text) return;
  const size = fitFontSize(font, text, rect);
  page.drawText(text, {
    x: rect.x + FIELD_PADDING,
    y: rect.y + (rect.height - size) / 2,
    size,
    font,
    color: rgb(0, 0, 0),
  });
}

// ZapfDingbats glyph a20, the heavy check mark. pdf-lib addresses standard-font
// glyphs by Unicode code point, so this is U+2714 rather than the '4' byte that
// selects a20 in the raw ZapfDingbats encoding.
const CHECK_MARK = '\u2714';

function drawCheckMark(page: PDFPage, dingbats: PDFFont, rect: PdfRect): void {
  const size = rect.height * 0.8;
  const width = dingbats.widthOfTextAtSize(CHECK_MARK, size);
  page.drawText(CHECK_MARK, {
    x: rect.x + (rect.width - width) / 2,
    y: rect.y + (rect.height - size) / 2,
    size,
    font: dingbats,
    color: rgb(0, 0, 0),
  });
}

/** Greedy word wrap so long audit values (consent, user agent) stay on the page. */
function wrapLine(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
  const words = toWinAnsi(text).split(' ').filter(Boolean);
  if (words.length === 0) return [''];

  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && font.widthOfTextAtSize(candidate, size) > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  lines.push(current);
  return lines;
}

function auditLines(input: StampInput, sourceSha256: string, stampedSha256: string): string[] {
  const { audit } = input;
  return [
    'Signature audit',
    `Document: ${DOCUMENTS[input.docKey].name}`,
    `Envelope: ${audit.envelopeId}`,
    `Signer: ${audit.signerName} <${audit.signerEmail}>`,
    `User id: ${audit.userId}`,
    `Signed at (UTC): ${input.signedAt.toISOString()}`,
    `Signed at (America/Chicago): ${formatSignDate(input.signedAt)}`,
    `Consent: ${audit.consentText}`,
    `Consent at (UTC): ${audit.consentAt.toISOString()}`,
    `IP address: ${audit.ip}`,
    `User agent: ${audit.userAgent}`,
    `Signature method: ${audit.signatureMethod}`,
    `Source PDF SHA-256: ${sourceSha256}`,
    `Stamped PDF SHA-256 (before this page): ${stampedSha256}`,
  ];
}

async function appendAuditPage(
  stampedBytes: Uint8Array,
  input: StampInput,
  sourceSha256: string,
  stampedSha256: string
): Promise<PDFDocument> {
  const doc = await PDFDocument.load(stampedBytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage(AUDIT_PAGE_SIZE);
  const maxWidth = AUDIT_PAGE_SIZE[0] - AUDIT_MARGIN * 2;

  let y = AUDIT_TOP;
  for (const line of auditLines(input, sourceSha256, stampedSha256)) {
    for (const wrapped of wrapLine(font, line, AUDIT_FONT_SIZE, maxWidth)) {
      page.drawText(wrapped, { x: AUDIT_MARGIN, y, size: AUDIT_FONT_SIZE, font, color: rgb(0, 0, 0) });
      y -= AUDIT_LEADING;
    }
  }

  return doc;
}

export async function stampDocument(input: StampInput): Promise<StampResult> {
  const config = DOCUMENTS[input.docKey];
  const sourceBytes = await readFile(path.join(process.cwd(), 'assets', 'esign', config.file));
  const sourceSha256 = sha256Hex(sourceBytes);

  const doc = await PDFDocument.load(sourceBytes);
  const helvetica = await doc.embedFont(StandardFonts.Helvetica);
  const dingbats = await doc.embedFont(StandardFonts.ZapfDingbats);

  for (const field of config.extra ?? []) {
    const value = input.fields[field.key];
    if (value === undefined || value === '' || value === false) continue;

    const page = doc.getPage(field.page - 1);
    const rect = boxToPdfRect(field, page.getHeight());
    if (field.type === 'checkbox') {
      drawCheckMark(page, dingbats, rect);
    } else {
      drawFieldText(page, helvetica, String(value), rect);
    }
  }

  // Signature and date always sit on the same page of every document.
  const signaturePage = doc.getPage(config.signature.page - 1);
  const pageHeight = signaturePage.getHeight();

  const signatureRect = boxToPdfRect(config.signature, pageHeight);
  const image = await doc.embedPng(input.signaturePng);
  const scale = Math.min(signatureRect.width / image.width, signatureRect.height / image.height);
  const drawnWidth = image.width * scale;
  const drawnHeight = image.height * scale;
  signaturePage.drawImage(image, {
    x: signatureRect.x + (signatureRect.width - drawnWidth) / 2,
    y: signatureRect.y + (signatureRect.height - drawnHeight) / 2,
    width: drawnWidth,
    height: drawnHeight,
  });

  drawFieldText(
    signaturePage,
    helvetica,
    formatSignDate(input.signedAt),
    boxToPdfRect(config.date, pageHeight)
  );

  // Hash the signed document before the audit page exists, because the audit
  // page prints that hash: it can only describe what came before it.
  const stampedBytes = await doc.save({ useObjectStreams: false });
  const stampedSha256 = sha256Hex(stampedBytes);

  const withAudit = await appendAuditPage(stampedBytes, input, sourceSha256, stampedSha256);

  return {
    pdf: Buffer.from(await withAudit.save({ useObjectStreams: false })),
    sourceSha256,
    stampedSha256,
    pageCount: withAudit.getPageCount(),
  };
}
