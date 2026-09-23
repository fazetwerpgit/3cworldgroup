// @vitest-environment jsdom
//
// A closing sheet stays on screen for its exit, marked closing, then goes;
// reduced motion closes it at once.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSheetExit } from './useSheetExit';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let reduce = false;

function Probe({ open }: { open: boolean }) {
  const { rendered, closing } = useSheetExit(open, 180);
  return <>{rendered ? (closing ? 'closing' : 'open') : 'gone'}</>;
}

const render = (open: boolean) => act(async () => root.render(<Probe open={open} />));

beforeEach(() => {
  vi.useFakeTimers();
  reduce = false;
  window.matchMedia = ((query: string) => ({ matches: reduce, media: query }) as MediaQueryList);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('useSheetExit', () => {
  it('holds a closing sheet for its exit, then lets it go', async () => {
    await render(true);
    expect(container.textContent).toBe('open');
    await render(false);
    expect(container.textContent).toBe('closing');
    await act(async () => vi.advanceTimersByTime(180));
    expect(container.textContent).toBe('gone');
  });

  it('reopening mid-exit shows it open again', async () => {
    await render(true);
    await render(false);
    await render(true);
    expect(container.textContent).toBe('open');
    await act(async () => vi.advanceTimersByTime(400));
    expect(container.textContent).toBe('open');
  });

  it('closes at once under reduced motion', async () => {
    reduce = true;
    await render(true);
    await render(false);
    expect(container.textContent).toBe('gone');
  });

  it('never shows a sheet that was never open', async () => {
    await render(false);
    expect(container.textContent).toBe('gone');
  });
});
