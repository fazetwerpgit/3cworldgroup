// @vitest-environment jsdom
// The bell panel's Clear all: a failed clear keeps the list and says so.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClearNotes } from './ClearNotes';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const clickButton = async () => {
  await act(async () => container.querySelector('button')!.click());
};

describe('ClearNotes', () => {
  it('shows a short error and a Retry when the clear fails', async () => {
    const clearAll = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    await act(async () => root.render(<ClearNotes clearAll={clearAll} />));

    await clickButton();
    expect(container.querySelector('[role=alert]')?.textContent).toBe("Couldn't clear");
    expect(container.querySelector('button')?.textContent).toBe('Retry');

    await clickButton();
    expect(clearAll).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role=alert]')).toBeNull();
    expect(container.querySelector('button')?.textContent).toBe('Clear all');
  });

  it('blocks a second tap while the clear is in flight', async () => {
    let finish: (ok: boolean) => void = () => {};
    const clearAll = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    await act(async () => root.render(<ClearNotes clearAll={clearAll} />));

    await clickButton();
    expect(container.querySelector('button')?.disabled).toBe(true);
    await act(async () => finish(true));
    expect(container.querySelector('button')?.disabled).toBe(false);
  });
});
