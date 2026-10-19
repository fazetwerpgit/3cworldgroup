// @vitest-environment jsdom
// A zoomed paint that fails (e.g. iOS's canvas memory cap) must not strand the
// rep: Fit width stays tappable and repaints at the lighter size.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const render = vi.fn();

vi.mock('pdfjs-dist', () => ({
  GlobalWorkerOptions: {},
  getDocument: () => ({
    promise: Promise.resolve({
      numPages: 1,
      destroy: () => Promise.resolve(),
      getPage: () =>
        Promise.resolve({
          getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
          render,
        }),
    }),
  }),
}));

import { PdfPages } from './PdfPages';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 10; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
};

const button = () => container.querySelector('button') as HTMLButtonElement;

beforeEach(() => {
  render.mockReset();
  render.mockImplementation(() => ({ promise: Promise.resolve(), cancel: () => {} }));
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) }))
  );
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    }
  );
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PdfPages zoom after a paint error', () => {
  it('keeps Fit width enabled when the zoomed paint fails and repaints unzoomed', async () => {
    await act(async () => {
      root.render(<PdfPages src="/doc.pdf" />);
    });
    await flush();
    expect(button().disabled).toBe(false);
    expect(button().textContent).toBe('Zoom in');

    // The zoomed render throws, as iOS does past its canvas memory cap.
    render.mockImplementationOnce(() => ({
      promise: Promise.reject(new Error('Canvas too large.')),
      cancel: () => {},
    }));
    await act(async () => {
      button().click();
    });
    await flush();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Canvas too large.');
    expect(button().textContent).toBe('Fit width');
    expect(button().disabled).toBe(false);

    await act(async () => {
      button().click();
    });
    await flush();
    expect(button().textContent).toBe('Zoom in');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(render).toHaveBeenCalledTimes(3);
  });

  it('keeps the toggle disabled when the document itself fails to load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false })));
    await act(async () => {
      root.render(<PdfPages src="/doc.pdf" />);
    });
    await flush();
    expect(container.querySelector('[role="alert"]')).not.toBeNull();
    expect(button().disabled).toBe(true);
  });
});
