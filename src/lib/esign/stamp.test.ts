import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage, StandardFonts } from 'pdf-lib';
import { formatSignDate, formatSignTimestamp, sha256Hex, stampDocument } from './stamp';
import { DOCUMENTS, boxToPdfRect } from './documents';
import type { EsignDocKey } from './provider';

// 2x2 opaque PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAD0lEQVR4nGNgYGD4z8DAAAAFAQH/8kZ0mwAAAABJRU5ErkJggg==',
  'base64'
);

const audit = {
  envelopeId: 'env-1',
  signerName: 'Test Rep',
  signerEmail: 't@example.com',
  userId: 'u1',
  consentText: 'I agree.',
  consentAt: new Date('2026-09-08T15:00:00Z'),
  ip: '203.0.113.5',
  userAgent: 'Mozilla/5.0 (iPhone)',
  signatureMethod: 'draw' as const,
};

const fieldsFor = (k: EsignDocKey) =>
  Object.fromEntries(
    (DOCUMENTS[k].extra ?? []).map((f) => [f.key, f.type === 'checkbox' ? true : `v-${f.key}`])
  );

afterEach(() => {
  vi.restoreAllMocks();
});

describe('stampDocument', () => {
  it.each(Object.keys(DOCUMENTS) as EsignDocKey[])(
    'stamps %s and appends one audit page',
    async (docKey) => {
      const r = await stampDocument({
        docKey,
        fields: fieldsFor(docKey),
        signaturePng: PNG,
        signedAt: new Date('2026-09-08T15:00:00Z'),
        audit,
      });
      const out = await PDFDocument.load(r.pdf);
      expect(out.getPageCount()).toBe(DOCUMENTS[docKey].pages + 1);
      expect(r.pageCount).toBe(DOCUMENTS[docKey].pages + 1);
      expect(r.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(r.stampedSha256).not.toBe(r.sourceSha256);
      // The audit page prints stampedSha256, so it cannot equal the final hash.
      expect(r.stampedSha256).not.toBe(sha256Hex(r.pdf));
    }
  );

  it('produces a different file when a checkbox flips', async () => {
    const a = await stampDocument({
      docKey: 'direct_deposit',
      fields: { checking: true },
      signaturePng: PNG,
      signedAt: new Date(0),
      audit,
    });
    const b = await stampDocument({
      docKey: 'direct_deposit',
      fields: { checking: false },
      signaturePng: PNG,
      signedAt: new Date(0),
      audit,
    });
    expect(a.stampedSha256).not.toBe(b.stampedSha256);
  });

  it('rejects a non-PNG signature', async () => {
    await expect(
      stampDocument({
        docKey: 'fcra_auth',
        fields: {},
        signaturePng: Buffer.from('nope'),
        signedAt: new Date(),
        audit,
      })
    ).rejects.toThrow();
  });

  it('scales the signature to fit its box and left-aligns it', async () => {
    const drawImage = vi.spyOn(PDFPage.prototype, 'drawImage');

    await stampDocument({
      docKey: 'pay_structure',
      fields: {},
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit,
    });

    const box = boxToPdfRect(DOCUMENTS.pay_structure.signature, 792);
    expect(drawImage).toHaveBeenCalledTimes(1);
    const options = drawImage.mock.calls[0][1] as {
      x: number;
      y: number;
      width: number;
      height: number;
    };
    // A square source image in a wider box: height fills, width is left-aligned
    // against a 2pt inset rather than centred.
    expect(options.width).toBeCloseTo(box.height, 6);
    expect(options.height).toBeCloseTo(box.height, 6);
    expect(options.x).toBeCloseTo(box.x + 2, 6);
    expect(options.x).toBeLessThan(box.x + (box.width - options.width) / 2);
    expect(options.x + options.width).toBeLessThanOrEqual(box.x + box.width + 1e-6);
    expect(options.y).toBeGreaterThanOrEqual(box.y - 1e-6);
    expect(options.y + options.height).toBeLessThanOrEqual(box.y + box.height + 1e-6);
  });

  it('strokes a vector check for a ticked box and nothing for an unticked one', async () => {
    const drawLine = vi.spyOn(PDFPage.prototype, 'drawLine');

    await stampDocument({
      docKey: 'direct_deposit',
      fields: { checking: true, savings: false },
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit,
    });

    const checkBox = boxToPdfRect(
      DOCUMENTS.direct_deposit.extra!.find((f) => f.key === 'checking')!,
      792
    );

    // One ticked box means exactly two segments, and no font glyph is involved.
    expect(drawLine).toHaveBeenCalledTimes(2);
    const segments = drawLine.mock.calls.map(
      ([options]) =>
        options as {
          start: { x: number; y: number };
          end: { x: number; y: number };
          thickness: number;
        }
    );

    for (const segment of segments) {
      for (const point of [segment.start, segment.end]) {
        expect(point.x).toBeGreaterThanOrEqual(checkBox.x);
        expect(point.x).toBeLessThanOrEqual(checkBox.x + checkBox.width);
        expect(point.y).toBeGreaterThanOrEqual(checkBox.y);
        expect(point.y).toBeLessThanOrEqual(checkBox.y + checkBox.height);
      }
      expect(segment.thickness).toBeCloseTo(Math.max(1.2, checkBox.height * 0.09), 6);
    }

    // The two segments meet at the elbow, low and left of centre.
    expect(segments[0].end).toEqual(segments[1].start);
    expect(segments[0].end.y).toBeLessThan(segments[0].start.y);
    expect(segments[1].end.y).toBeGreaterThan(segments[1].start.y);
    expect(segments[1].end.x).toBeGreaterThan(segments[0].start.x);
  });

  it('draws no check strokes when every box is unticked', async () => {
    const drawLine = vi.spyOn(PDFPage.prototype, 'drawLine');

    await stampDocument({
      docKey: 'direct_deposit',
      fields: { checking: false, savings: false },
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit,
    });

    expect(drawLine).not.toHaveBeenCalled();
  });

  it('writes each text field and the sign date onto the document', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');

    await stampDocument({
      docKey: 'contract',
      fields: { agent_name: 'Sam Rep', email: 'sam@x.com' },
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit,
    });

    const drawn = drawText.mock.calls.map(([text]) => text);
    expect(drawn).toContain('Sam Rep');
    expect(drawn).toContain('sam@x.com');
    expect(drawn).toContain('09/08/2026');
    // Fields the rep left out are not stamped as empty or "undefined".
    expect(drawn).not.toContain('undefined');
  });

  // The email box on the contract sits beside 11pt neighbours, so a value that
  // shrank into the 5-6pt range read as a misprint rather than an answer.
  describe('the email box on the contract', () => {
    const emailBox = boxToPdfRect(
      DOCUMENTS.contract.extra!.find((field) => field.key === 'email')!,
      792
    );
    const maxWidth = emailBox.width - 4;

    const stampEmail = async (email: string) => {
      const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
      await stampDocument({
        docKey: 'contract',
        fields: { email },
        signaturePng: PNG,
        signedAt: new Date('2026-09-08T15:00:00Z'),
        audit,
      });
      const call = drawText.mock.calls.find(
        ([, options]) => (options as { x: number }).x === emailBox.x + 2
      );
      if (!call) throw new Error('the email field was not drawn');
      return { text: call[0] as string, size: (call[1] as { size: number }).size };
    };

    const helvetica = async () => {
      const doc = await PDFDocument.create();
      return doc.embedFont(StandardFonts.Helvetica);
    };

    it('fits an ordinary email whole, at a size that matches its neighbours', async () => {
      const email = 'sam.johnson@example.co.uk'; // 25 characters.
      const { text, size } = await stampEmail(email);

      expect(text).toBe(email);
      expect(size).toBeGreaterThanOrEqual(9);
    });

    it('truncates an absurd email instead of shrinking it below 7pt', async () => {
      const email = 'jonathan.q.hendersoniii@verylongexamplemail.co.uk'; // 49 characters.
      const { text, size } = await stampEmail(email);

      // The floor holds: the old 6pt minimum is what made this unreadable.
      expect(size).toBe(7);
      expect(text).not.toBe(email);
      expect(text.endsWith('...')).toBe(true);
      expect(email.startsWith(text.slice(0, -3))).toBe(true);
      // And what is drawn genuinely fits the box rather than running past it.
      const font = await helvetica();
      expect(font.widthOfTextAtSize(text, size)).toBeLessThanOrEqual(maxWidth);
      expect(font.widthOfTextAtSize(email, size)).toBeGreaterThan(maxWidth);
    });
  });

  it('survives characters the standard fonts cannot encode', async () => {
    const r = await stampDocument({
      docKey: 'contract',
      fields: { agent_name: 'Renée “Bo” Smith 🚀' },
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit: { ...audit, userAgent: 'Mozilla/5.0 (iPhone) — 🚀' },
    });
    expect(r.pageCount).toBe(DOCUMENTS.contract.pages + 1);
  });

  it('wraps the long audit values instead of running them off the page', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');

    await stampDocument({
      docKey: 'fcra_auth',
      fields: {},
      signaturePng: PNG,
      signedAt: new Date('2026-09-08T15:00:00Z'),
      audit: { ...audit, userAgent: 'Mozilla/5.0 '.repeat(40) },
    });

    const auditText = drawText.mock.calls
      .map(([text]) => text as string)
      .filter((text) => text.startsWith('User agent:') || text.includes('Mozilla/5.0'));
    expect(auditText.length).toBeGreaterThan(1);
    for (const line of auditText) {
      expect(line.length).toBeLessThan(140);
    }
  });
});

describe('formatSignTimestamp', () => {
  it('prints a full local timestamp with its zone abbreviation', () => {
    expect(formatSignTimestamp(new Date('2026-09-08T18:15:07Z'))).toBe(
      '09/08/2026 1:15:07 PM CDT'
    );
  });

  it('lands on the audit page instead of a bare date', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');
    const signedAt = new Date('2026-09-08T18:15:07Z');

    await stampDocument({
      docKey: 'fcra_auth',
      fields: {},
      signaturePng: PNG,
      signedAt,
      audit,
    });

    const drawn = drawText.mock.calls.map(([text]) => text as string);
    expect(drawn).toContain(`Signed at (America/Chicago): ${formatSignTimestamp(signedAt)}`);
    expect(drawn).not.toContain(`Signed at (America/Chicago): ${formatSignDate(signedAt)}`);
  });
});

describe('formatSignDate', () => {
  it('formats the sign date in Chicago time', () => {
    expect(formatSignDate(new Date('2026-09-09T03:30:00Z'))).toBe('09/08/2026');
  });

  it('rolls over once Chicago reaches midnight', () => {
    expect(formatSignDate(new Date('2026-09-09T05:30:00Z'))).toBe('09/09/2026');
  });
});

describe('sha256Hex', () => {
  it('hashes bytes to lowercase hex', () => {
    expect(sha256Hex(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
    );
  });
});
