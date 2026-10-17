// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlockedMessageButton, MessageQuote } from './BlockedContent';

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

describe('blocked content (both thread layouts)', () => {
  it('shows a quiet row that opens the message', () => {
    const onShow = vi.fn();
    act(() => root.render(<BlockedMessageButton onShow={onShow} />));
    expect(container.textContent).toBe('Message from a blocked userShow');
    act(() => container.querySelector('button')!.click());
    expect(onShow).toHaveBeenCalledTimes(1);
  });

  it('hides the name and words of a blocked quote', () => {
    const replyTo = { messageId: 'm1', authorId: 'cole', authorName: 'Cole Hart', text: 'rude thing' };
    act(() => root.render(<MessageQuote replyTo={replyTo} blocked />));
    expect(container.textContent).toBe('Quoted message from a blocked user');
    act(() => root.render(<MessageQuote replyTo={replyTo} blocked={false} />));
    expect(container.textContent).toContain('Cole Hart');
    expect(container.textContent).toContain('rude thing');
  });
});
