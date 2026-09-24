// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SignaturePad } from './SignaturePad';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  vi.restoreAllMocks();
});

// Opening on the Type tab keeps the canvas (and its ResizeObserver) out of
// jsdom entirely: the pad starts on whichever method the stored signature used.
async function renderTypeTab() {
  await act(async () => {
    root.render(
      <SignaturePad
        value={{ png: 'data:image/png;base64,AAAA', method: 'type' }}
        signerName=""
        onChange={vi.fn()}
      />
    );
  });
  const input = container.querySelector<HTMLInputElement>('#esign-typed-name');
  if (!input) throw new Error('typed-name input did not render');
  return input;
}

describe('SignaturePad typed name field', () => {
  // The field is a dark D input now: the ink comes from the portal's
  // foreground (.portal-scope input), so nothing may pin it to navy, which
  // would be navy on navy.
  it('does not force a navy ink onto the dark field', async () => {
    const input = await renderTypeTab();

    expect(input.style.color).toBe('');
    expect(input.className).not.toMatch(/text-\[#0A1F44\]/i);
  });

  it('keeps the name field labelled and off the autocorrect path', async () => {
    const input = await renderTypeTab();

    expect(container.querySelector('label[for="esign-typed-name"]')?.textContent).toBe('Type your full name');
    expect(input.getAttribute('autocomplete')).toBe('name');
    expect(input.getAttribute('spellcheck')).toBe('false');
  });
});

describe('SignaturePad drawing through a rotation', () => {
  function pointer(type: string, x: number, y: number, pointerId = 1) {
    const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
    Object.assign(event, { pointerId, pointerType: 'touch' });
    return event;
  }

  it('repaints the stroke at the new size and keeps the signature', async () => {
    let box = { width: 400, height: 160 };
    vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockImplementation(
      () => ({ left: 0, top: 0, ...box }) as DOMRect
    );
    const drawn: [string, number, number][] = [];
    const ctx = {
      scale: vi.fn(),
      beginPath: vi.fn(),
      arc: (x: number, y: number) => drawn.push(['arc', x, y]),
      fill: vi.fn(),
      moveTo: (x: number, y: number) => drawn.push(['moveTo', x, y]),
      lineTo: (x: number, y: number) => drawn.push(['lineTo', x, y]),
      stroke: vi.fn(),
      clearRect: vi.fn(),
      getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(w * h * 4).fill(255) }),
      drawImage: vi.fn(),
    };
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/png;base64,SIG');
    HTMLCanvasElement.prototype.setPointerCapture = vi.fn();
    let resized = () => {};
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: () => void) {
          resized = callback;
        }
        observe() {}
        disconnect() {}
      }
    );
    const onChange = vi.fn();

    await act(async () => {
      root.render(<SignaturePad value={null} onChange={onChange} />);
    });
    const canvas = container.querySelector('canvas');
    if (!canvas) throw new Error('pad did not render');
    await act(async () => {
      canvas.dispatchEvent(pointer('pointerdown', 100, 40));
      canvas.dispatchEvent(pointer('pointermove', 300, 120));
      canvas.dispatchEvent(pointer('pointerup', 300, 120));
    });
    expect(onChange).toHaveBeenLastCalledWith('data:image/png;base64,SIG', 'draw');

    // Portrait again: the pad is half as wide. The bitmap is wiped by the resize.
    box = { width: 200, height: 160 };
    drawn.length = 0;
    await act(async () => resized());

    expect(drawn).toEqual([
      ['arc', 50, 20],
      ['moveTo', 50, 20],
      ['lineTo', 150, 60],
    ]);
    expect(onChange).not.toHaveBeenCalledWith(null, 'draw');
    vi.unstubAllGlobals();
  });
});
