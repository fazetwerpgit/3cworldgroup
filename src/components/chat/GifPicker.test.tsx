// @vitest-environment jsdom
//
// GifPicker outside-press dismissal: a press outside the composer wrapper
// closes it, but a press on the GIF trigger that shares the wrapper does not,
// so the trigger's own toggle can close the picker instead of reopening it.
import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GifPicker } from './GifPicker';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

const authedFetch = vi.fn(async () => ({ ok: true, json: async () => ({ results: [] }) }) as Response);

function Composer() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" data-testid="outside">
        Elsewhere
      </button>
      <div data-gif-anchor="">
        <button type="button" data-testid="trigger" onClick={() => setOpen((value) => !value)}>
          GIF
        </button>
        {open && <GifPicker authedFetch={authedFetch} onSelect={() => {}} onClose={() => setOpen(false)} />}
      </div>
    </div>
  );
}

// A tap: mousedown and click are separate events, as WebKit delivers them.
function tap(el: Element) {
  act(() => {
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  });
  act(() => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const picker = () => container.querySelector('[role="dialog"]');
const byId = (id: string) => container.querySelector(`[data-testid="${id}"]`) as HTMLElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(<Composer />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('GifPicker dismissal', () => {
  it('closes when the GIF trigger is tapped again', () => {
    tap(byId('trigger'));
    expect(picker()).not.toBeNull();
    tap(byId('trigger'));
    expect(picker()).toBeNull();
  });

  it('closes on a press outside the composer wrapper', () => {
    tap(byId('trigger'));
    expect(picker()).not.toBeNull();
    tap(byId('outside'));
    expect(picker()).toBeNull();
  });

  it('stays open on a press inside the panel', () => {
    tap(byId('trigger'));
    tap(container.querySelector('input[type="search"]') as HTMLElement);
    expect(picker()).not.toBeNull();
  });
});
