// @vitest-environment jsdom
//
// The phone action sheet opens while the long-press finger is still down, so
// the tap from that release must not choose a row, and Delete (the last row,
// right under the thumb) asks once more before it runs.
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessageActionSheet, SHEET_TAP_GUARD_MS, type MessageActionsConfig } from './MessageActions';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
let config: MessageActionsConfig;
let onClose: ReturnType<typeof vi.fn<() => void>>;

function button(label: string) {
  const match = Array.from(document.body.querySelectorAll('button')).find(
    (node) => node.textContent?.trim() === label
  );
  if (!match) throw new Error(`No "${label}" button`);
  return match;
}

function render() {
  act(() => root.render(<MessageActionSheet open config={config} authorName="Cole Hart" onClose={onClose} />));
}

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  onClose = vi.fn<() => void>();
  config = {
    hasText: true,
    canEdit: true,
    canDelete: true,
    canPin: false,
    isPinned: false,
    onReply: vi.fn(),
    onCopy: vi.fn(),
    onEdit: vi.fn(),
    onDelete: vi.fn(),
    onTogglePin: vi.fn(),
  };
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('MessageActionSheet', () => {
  it('ignores a tap that arrives right as it opens', () => {
    render();
    act(() => button('Reply').click());
    expect(config.onReply).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(SHEET_TAP_GUARD_MS));
    act(() => button('Reply').click());
    expect(config.onReply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('asks before deleting, and Keep it backs out', () => {
    render();
    act(() => vi.advanceTimersByTime(SHEET_TAP_GUARD_MS));

    act(() => button('Delete').click());
    expect(config.onDelete).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Delete this message? This can't be undone.");

    act(() => button('Keep it').click());
    expect(config.onDelete).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => button('Delete').click());
    act(() => button('Delete message').click());
    expect(config.onDelete).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('has a Cancel row that just closes', () => {
    render();
    act(() => vi.advanceTimersByTime(SHEET_TAP_GUARD_MS));
    act(() => button('Cancel').click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(config.onDelete).not.toHaveBeenCalled();
  });
});
