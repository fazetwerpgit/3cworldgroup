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
  // globals.css sets `.portal-scope input { color: var(--foreground) }`, which
  // outranks any `text-*` utility class on the element. Only an inline style
  // wins, and without it the typed name was light-on-white and unreadable.
  it('states its ink inline so the portal-scope input rule cannot override it', async () => {
    const input = await renderTypeTab();

    expect(input.style.color).toBe('rgb(10, 31, 68)');
    expect(input.style.caretColor).toBe('rgb(10, 31, 68)');
  });

  it('does not rely on a text colour utility class for the ink', async () => {
    const input = await renderTypeTab();

    expect(input.className).not.toMatch(/text-\[#0A1F44\]/i);
    // The placeholder has no competing portal-scope rule, so it stays a class.
    expect(input.className).toContain('placeholder:text-slate-500');
  });
});
