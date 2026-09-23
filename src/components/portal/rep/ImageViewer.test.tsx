// @vitest-environment jsdom
//
// The in-app image viewer behind Log Sale's proof thumbnails: a new tab strands
// a rep in the iPhone home-screen app, so images open here and every way out
// (Close, Escape, a tap on the dark area, the back gesture) closes it and hands
// focus back to the thumbnail. PDFs still go to a new tab.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const openInNewTab = vi.fn<(resolve: () => Promise<string | null>) => Promise<void>>(async () => {});
vi.mock('@/lib/forms/openAttachment', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/forms/openAttachment')>();
  return { ...actual, openAttachmentInNewTab: (resolve: () => Promise<string | null>) => openInNewTab(resolve) };
});
vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: async () => null }));

import { ProofCapture, type ProofTile, type ProofUploads } from './ProofCapture';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function uploadsWith(tiles: ProofTile[]): ProofUploads {
  return {
    tiles,
    addFiles: vi.fn(() => 0),
    retry: vi.fn(),
    discard: vi.fn(),
    remove: vi.fn(),
    room: 2,
    overCap: false,
    uploadingCount: 0,
  };
}

const imageTile: ProofTile = {
  kind: 'done',
  key: 'proof/a',
  path: 'proof/a',
  preview: { url: 'blob:http://localhost/shot', isPdf: false },
};
const pdfTile: ProofTile = { kind: 'done', key: 'proof/b', path: 'proof/b', preview: { url: null, isPdf: true } };

async function renderProof(tiles: ProofTile[]) {
  await act(async () => root.render(<ProofCapture uploads={uploadsWith(tiles)} orderRequired={false} />));
}

const dialog = () => document.body.querySelector<HTMLElement>('[role="dialog"]');
const thumb = (n = 1) =>
  container.querySelector<HTMLButtonElement>(`button[aria-label="View screenshot ${n}"]`) as HTMLButtonElement;

async function click(el: Element) {
  await act(async () => (el as HTMLElement).click());
}

async function openFirst() {
  await click(thumb());
  expect(dialog()).not.toBeNull();
}

beforeEach(() => {
  openInNewTab.mockClear();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ url: 'https://storage.example/proof/b/order.pdf' }), { status: 200 }))
  );
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  // Let an unmounted viewer's deferred history.back() run inside this test.
  await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
  container.remove();
  document.body.style.overflow = '';
  vi.unstubAllGlobals();
});

describe('ImageViewer from ProofCapture', () => {
  it('opens the tapped screenshot in-app, not in a new tab', async () => {
    await renderProof([imageTile]);
    await openFirst();
    const img = dialog()?.querySelector('img');
    expect(img?.getAttribute('src')).toBe('blob:http://localhost/shot');
    expect(img?.getAttribute('alt')).toBe('Screenshot 1');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    expect(openInNewTab).not.toHaveBeenCalled();
    expect(document.body.style.overflow).toBe('hidden');
  });

  it('Close closes it and returns focus to the thumbnail', async () => {
    await renderProof([imageTile]);
    await openFirst();
    const close = dialog()?.querySelector('button') as HTMLButtonElement;
    expect(close.textContent).toContain('Close');
    expect(document.activeElement).toBe(close);
    await click(close);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(thumb());
    expect(document.body.style.overflow).toBe('');
  });

  it('Escape closes it and returns focus to the thumbnail', async () => {
    await renderProof([imageTile]);
    await openFirst();
    await act(async () => {
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(thumb());
  });

  it('a tap on the dark area closes it; a tap on the image does not', async () => {
    await renderProof([imageTile]);
    await openFirst();
    await click(dialog()?.querySelector('img') as HTMLImageElement);
    expect(dialog()).not.toBeNull();
    await click(dialog()?.querySelector('[data-part="stage"]') as HTMLElement);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(thumb());
  });

  it('the back gesture closes it without another history step', async () => {
    const back = vi.spyOn(window.history, 'back');
    await renderProof([imageTile]);
    await openFirst();
    expect(window.history.state).toEqual({ imageViewer: true });
    await act(async () => window.dispatchEvent(new PopStateEvent('popstate', { state: null })));
    expect(dialog()).toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('closing with the button consumes the pushed history entry', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    await renderProof([imageTile]);
    await openFirst();
    await click(dialog()?.querySelector('button') as HTMLButtonElement);
    await act(async () => new Promise((resolve) => setTimeout(resolve, 5)));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
  });

  it('keeps Tab inside the viewer', async () => {
    await renderProof([imageTile]);
    await openFirst();
    const close = dialog()?.querySelector('button') as HTMLButtonElement;
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    await act(async () => void close.dispatchEvent(tab));
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('a PDF still goes through openAttachment', async () => {
    await renderProof([pdfTile]);
    await click(thumb());
    expect(dialog()).toBeNull();
    expect(openInNewTab).toHaveBeenCalledTimes(1);
    await expect(openInNewTab.mock.calls[0][0]()).resolves.toBe('https://storage.example/proof/b/order.pdf');
  });

  it('a restored screenshot signs its URL, and a PDF found that way gets an Open PDF link', async () => {
    await renderProof([{ kind: 'done', key: 'proof/c', path: 'proof/c', preview: null }]);
    await click(thumb());
    expect(dialog()).not.toBeNull();
    await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
    const link = dialog()?.querySelector('a');
    expect(link?.getAttribute('href')).toBe('https://storage.example/proof/b/order.pdf');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(openInNewTab).not.toHaveBeenCalled();
  });
});
