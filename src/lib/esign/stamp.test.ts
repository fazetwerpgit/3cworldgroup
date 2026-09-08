import { afterEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import { formatSignDate, sha256Hex, stampDocument } from './stamp';
import { DOCUMENTS, boxToPdfRect } from './documents';
import type { EsignDocKey } from './provider';

// ZapfDingbats a20 heavy check mark, addressed by Unicode code point.
const CHECK_MARK = '\u2714';

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

  it('scales the signature to fit inside its box', async () => {
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
    // A square source image in a wider box: height fills, width is centred.
    expect(options.width).toBeCloseTo(box.height, 6);
    expect(options.height).toBeCloseTo(box.height, 6);
    expect(options.x).toBeGreaterThanOrEqual(box.x);
    expect(options.x + options.width).toBeLessThanOrEqual(box.x + box.width + 1e-6);
    expect(options.y).toBeGreaterThanOrEqual(box.y - 1e-6);
    expect(options.y + options.height).toBeLessThanOrEqual(box.y + box.height + 1e-6);
  });

  it('draws a dingbat check for a ticked box and nothing for an unticked one', async () => {
    const drawText = vi.spyOn(PDFPage.prototype, 'drawText');

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
    const checks = drawText.mock.calls.filter(([text]) => text === CHECK_MARK);
    expect(checks).toHaveLength(1);
    const options = checks[0][1] as { x: number; y: number; size: number };
    expect(options.x).toBeGreaterThanOrEqual(checkBox.x);
    expect(options.y).toBeGreaterThanOrEqual(checkBox.y);
    expect(options.size).toBeCloseTo(checkBox.height * 0.8, 6);
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
