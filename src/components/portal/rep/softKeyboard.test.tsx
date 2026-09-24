// @vitest-environment jsdom
//
// TesterB 9/24: on a phone, tapping the e-sign consent box right after typing
// missed. The blur collapsed the in-flow sign bar between the tap's down and
// its click, the page moved, and the click landed elsewhere. The keyboard
// state must hold still until the tap's click has landed.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSoftKeyboardOpen } from './RepForm';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

function Probe() {
  const open = useSoftKeyboardOpen();
  return (
    <>
      <input id="field" />
      <output id="state">{open ? 'open' : 'closed'}</output>
    </>
  );
}

const state = () => document.getElementById('state')?.textContent;
const field = () => document.getElementById('field') as HTMLInputElement;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(pointer: coarse)' }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useSoftKeyboardOpen', () => {
  it('follows focus when no tap is in progress', async () => {
    await act(async () => field().focus());
    expect(state()).toBe('open');
    await act(async () => field().blur());
    expect(state()).toBe('closed');
  });

  it('holds a blur that happens mid-tap until the click has landed', async () => {
    await act(async () => field().focus());

    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
      field().blur();
    });
    expect(state()).toBe('open');

    await act(async () => {
      document.body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(state()).toBe('open');

    await act(async () => vi.runOnlyPendingTimers());
    expect(state()).toBe('closed');
  });

  it('lets go of a tap that never clicks', async () => {
    await act(async () => field().focus());
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      field().blur();
    });
    expect(state()).toBe('open');

    await act(async () => vi.advanceTimersByTime(2100));
    expect(state()).toBe('closed');
  });
});
