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
