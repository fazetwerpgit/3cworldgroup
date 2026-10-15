// @vitest-environment jsdom
//
// PDF first-page previews are best-effort: whatever pdf.js does (fails to load,
// rejects an encrypted file, hangs), the picked PDF must still come out of
// prepareImageForUpload ready to upload and send as a plain chip.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type GetDocument = (params: { data: Uint8Array }) => { promise: Promise<unknown>; destroy: () => Promise<void> };
const pdfjs = vi.hoisted(() => ({
  getDocument: vi.fn<GetDocument>(),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist', () => pdfjs);

import { prepareImageForUpload, withPdfPreview } from './attachmentUpload';
import { renderPdfPreview } from './pdfPreview';
import type { ChatAttachment } from '@/types';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
function pdfFile(name = 'Route map.pdf') {
  return new File([PDF_BYTES], name, { type: 'application/pdf' });
}

function loadingTask(promise: Promise<unknown>) {
  return { promise, destroy: vi.fn(async () => undefined) };
}

// A one-page US Letter document (612x792pt) that renders without error.
function letterDocument() {
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 612 * scale, height: 792 * scale }),
    render: vi.fn(() => ({ promise: Promise.resolve() })),
  };
  return { getPage: vi.fn(async () => page), page };
}

beforeEach(() => {
  pdfjs.getDocument.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('prepareImageForUpload (PDF preview failures are non-fatal)', () => {
  it('sends an encrypted PDF without a preview', async () => {
    pdfjs.getDocument.mockReturnValue(
      loadingTask(Promise.reject(Object.assign(new Error('No password given'), { name: 'PasswordException' })))
    );
    const prepared = await prepareImageForUpload(pdfFile());
    expect(prepared.preview).toBeUndefined();
    expect(prepared.file.type).toBe('application/pdf');
    expect(prepared.file.name).toBe('Route map.pdf');
    expect(new Uint8Array(await prepared.file.arrayBuffer())).toEqual(PDF_BYTES);
  });

  it('sends the PDF without a preview when pdf.js throws while opening it', async () => {
    pdfjs.getDocument.mockImplementation(() => {
      throw new Error('Invalid PDF structure');
    });
    const prepared = await prepareImageForUpload(pdfFile());
    expect(prepared.preview).toBeUndefined();
    expect(prepared.file.type).toBe('application/pdf');
  });

  it('gives up on a preview that takes too long, destroying the pdf.js task', async () => {
    const task = loadingTask(new Promise(() => undefined));
    pdfjs.getDocument.mockReturnValue(task);
    await expect(renderPdfPreview(pdfFile(), 20)).rejects.toThrow(/timed out/);
    expect(task.destroy).toHaveBeenCalled();
  });

  it('yields an attachment that stays a plain PDF when no preview was uploaded', () => {
    const file: ChatAttachment = { type: 'file', url: 'https://x/doc.pdf', name: 'a.pdf', contentType: 'application/pdf' };
    expect(withPdfPreview(file, undefined)).toEqual(file);
    expect(withPdfPreview(file, { type: 'image', url: 'https://x/t.webp', width: 618, height: 800 })).toEqual({
      ...file,
      previewUrl: 'https://x/t.webp',
      previewWidth: 618,
      previewHeight: 800,
    });
  });
});

describe('renderPdfPreview', () => {
  it('renders page 1 at an 800px long edge on white and records its size', async () => {
    const doc = letterDocument();
    pdfjs.getDocument.mockReturnValue(loadingTask(Promise.resolve(doc)));
    const fillRect = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect,
      fillStyle: '',
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (callback, type) {
      callback(new Blob([new Uint8Array(40_000)], { type: type ?? 'image/png' }));
    });

    const preview = await renderPdfPreview(pdfFile('Rate card.pdf'));
    expect(doc.getPage).toHaveBeenCalledWith(1);
    expect(preview.width).toBe(618);
    expect(preview.height).toBe(800);
    expect(preview.file.type).toBe('image/webp');
    expect(preview.file.name).toBe('Rate card-preview.webp');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 618, 800);
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdf\.worker\.min\.mjs$/);
  });

  it('falls back to JPEG where the browser cannot encode WebP, and fails if nothing fits', async () => {
    pdfjs.getDocument.mockReturnValue(loadingTask(Promise.resolve(letterDocument())));
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    const toBlob = vi.spyOn(HTMLCanvasElement.prototype, 'toBlob');
    // Safari-style: an unsupported type comes back as PNG.
    toBlob.mockImplementation(function (callback, type) {
      callback(new Blob([new Uint8Array(30_000)], { type: type === 'image/webp' ? 'image/png' : type }));
    });
    expect((await renderPdfPreview(pdfFile())).file.type).toBe('image/jpeg');

    pdfjs.getDocument.mockReturnValue(loadingTask(Promise.resolve(letterDocument())));
    toBlob.mockImplementation(function (callback, type) {
      callback(new Blob([new Uint8Array(400 * 1024)], { type }));
    });
    await expect(renderPdfPreview(pdfFile())).rejects.toThrow(/compressed/);
  });
});
