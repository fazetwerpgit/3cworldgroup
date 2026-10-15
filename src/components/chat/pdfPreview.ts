// First-page thumbnail for a picked PDF, rendered on the device with pdf.js so
// the chat can show the document like a photo tile. pdf.js is loaded with a
// dynamic import() the first time a PDF is attached: no chat bundle cost. Every
// failure (no canvas, pdf.js load error, encrypted or corrupt file, timeout,
// a page that will not compress small enough) rejects, and the caller sends
// the PDF without a preview.

export type PdfPreview = { file: File; width: number; height: number };

// Long edge of the rendered page, in pixels.
export const PDF_PREVIEW_LONG_EDGE = 800;
// Largest preview we upload; a busier page steps its quality down to fit.
export const PDF_PREVIEW_MAX_BYTES = 300 * 1024;
// Give up on the preview after this long (huge or pathological files).
export const PDF_PREVIEW_TIMEOUT_MS = 8_000;

const QUALITY_STEPS = [0.8, 0.65, 0.5];

type PdfJs = typeof import('pdfjs-dist');
let pdfjsLoad: Promise<PdfJs> | null = null;

function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsLoad) {
    pdfjsLoad = import('pdfjs-dist')
      .then((pdfjs) => {
        // The bundler emits the worker as its own asset and rewrites this URL.
        pdfjs.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();
        return pdfjs;
      })
      .catch((error: unknown) => {
        // A chunk-load failure (bad signal) may succeed on the next PDF.
        pdfjsLoad = null;
        throw error;
      });
  }
  return pdfjsLoad;
}

function previewName(pdfName: string, ext: string): string {
  const base = pdfName.replace(/\.[^.]+$/, '') || 'document';
  return `${base}-preview.${ext}`;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

// WebP where the browser can encode it (toBlob silently falls back to PNG when
// it cannot), JPEG otherwise; quality steps down until it fits the byte cap.
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  for (const type of ['image/webp', 'image/jpeg']) {
    for (const quality of QUALITY_STEPS) {
      const blob = await canvasBlob(canvas, type, quality);
      if (!blob || blob.type !== type) break; // This encoder is unavailable: try the next type.
      if (blob.size <= PDF_PREVIEW_MAX_BYTES) return blob;
    }
  }
  throw new Error('PDF preview could not be compressed');
}

async function renderFirstPage(file: File, isCancelled: () => boolean, onTask: (destroy: () => void) => void) {
  const pdfjs = await loadPdfJs();
  if (isCancelled()) throw new Error('PDF preview timed out');
  const data = new Uint8Array(await file.arrayBuffer());
  // No onPassword handler: an encrypted PDF rejects with a PasswordException.
  const task = pdfjs.getDocument({ data });
  onTask(() => void task.destroy());
  try {
    const doc = await task.promise;
    const page = await doc.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const longEdge = Math.max(base.width, base.height);
    if (!(longEdge > 0)) throw new Error('PDF page has no size');
    const viewport = page.getViewport({ scale: PDF_PREVIEW_LONG_EDGE / longEdge });
    const width = Math.max(1, Math.round(viewport.width));
    const height = Math.max(1, Math.round(viewport.height));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('No 2D canvas');
    // Transparent pages read as a white sheet, never as black JPEG pixels.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    await page.render({ canvas, viewport }).promise;
    if (isCancelled()) throw new Error('PDF preview timed out');
    const blob = await encodeCanvas(canvas);
    const ext = blob.type === 'image/webp' ? 'webp' : 'jpg';
    return {
      file: new File([blob], previewName(file.name, ext), { type: blob.type }),
      width,
      height,
    };
  } finally {
    void task.destroy();
  }
}

/**
 * Render page 1 of `file` to a ≤800px WebP/JPEG (≤300 KB). Rejects on any
 * failure or after `timeoutMs`; the caller treats that as "no preview".
 */
export function renderPdfPreview(file: File, timeoutMs = PDF_PREVIEW_TIMEOUT_MS): Promise<PdfPreview> {
  if (typeof document === 'undefined') return Promise.reject(new Error('No DOM'));
  let cancelled = false;
  let destroyTask: (() => void) | null = null;
  return new Promise<PdfPreview>((resolve, reject) => {
    const timer = setTimeout(() => {
      cancelled = true;
      destroyTask?.();
      reject(new Error('PDF preview timed out'));
    }, timeoutMs);
    renderFirstPage(
      file,
      () => cancelled,
      (destroy) => {
        destroyTask = destroy;
      }
    ).then(
      (preview) => {
        clearTimeout(timer);
        resolve(preview);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}
