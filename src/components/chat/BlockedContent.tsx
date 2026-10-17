'use client';

import type { ChatReplySnippet } from '@/types';
import { BLOCKED_MESSAGE_LABEL, BLOCKED_QUOTE_LABEL } from '@/lib/chat/blocked';
import c from './chat.module.css';

/** The collapsed row a blocked author's message becomes; Show opens that one message. */
export function BlockedMessageButton({ onShow }: { onShow: () => void }) {
  return (
    <button type="button" className={c.blockedRow} onClick={onShow}>
      {BLOCKED_MESSAGE_LABEL}
      <span>Show</span>
    </button>
  );
}

/** A reply quote, or a nameless placeholder when it quotes someone the reader blocked. */
export function MessageQuote({ replyTo, blocked }: { replyTo: ChatReplySnippet; blocked: boolean }) {
  if (blocked) {
    return (
      <div className={`${c.quote} ${c.quoteBlocked}`}>
        <span>{BLOCKED_QUOTE_LABEL}</span>
      </div>
    );
  }
  return (
    <div className={c.quote}>
      <strong>{replyTo.authorName}</strong>
      <span>{replyTo.text}</span>
    </div>
  );
}
