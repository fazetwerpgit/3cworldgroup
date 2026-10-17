import { describe, expect, it } from 'vitest';
import { isComposerSend } from './composerKeys';

describe('isComposerSend', () => {
  it('sends on a plain Enter (and the iPhone Send key)', () => {
    expect(isComposerSend({ key: 'Enter' })).toBe(true);
  });

  it('sends on Cmd/Ctrl+Enter, as before', () => {
    expect(isComposerSend({ key: 'Enter', metaKey: true } as never)).toBe(true);
    expect(isComposerSend({ key: 'Enter', ctrlKey: true } as never)).toBe(true);
  });

  it('keeps Shift+Enter and Alt+Enter as a new line', () => {
    expect(isComposerSend({ key: 'Enter', shiftKey: true })).toBe(false);
    expect(isComposerSend({ key: 'Enter', altKey: true })).toBe(false);
  });

  it('never sends while an IME composition is open', () => {
    expect(isComposerSend({ key: 'Enter', isComposing: true })).toBe(false);
    expect(isComposerSend({ key: 'Enter', keyCode: 229 })).toBe(false);
  });

  it('ignores other keys', () => {
    expect(isComposerSend({ key: 'a' })).toBe(false);
  });
});
