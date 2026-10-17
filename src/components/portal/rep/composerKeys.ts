// Enter in a chat-style composer (Ask, Practice): a plain Enter sends, like
// Messages. Shift+Enter (or Alt+Enter) adds a new line on a hardware keyboard.
// On an iPhone the soft keyboard's return key is the Send key (enterKeyHint),
// and it arrives as a plain Enter too. An Enter that confirms an IME
// composition (Japanese, Chinese, dictation) never sends.

export interface ComposerKeyLike {
  key: string;
  shiftKey?: boolean;
  altKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}

/** True when this keydown should send the composer instead of adding a line. */
export function isComposerSend(event: ComposerKeyLike): boolean {
  if (event.key !== 'Enter') return false;
  if (event.shiftKey || event.altKey) return false;
  // 229: Safari's keyCode while an IME composition is open.
  if (event.isComposing || event.keyCode === 229) return false;
  return true;
}
