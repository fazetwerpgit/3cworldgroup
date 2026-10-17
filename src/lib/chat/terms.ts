import type { NextRequest } from 'next/server';

// The one-time team chat agreement, as the API enforces it. The 3C app (its
// web view and its native chat screen) sends a user agent carrying
// "3CPortalApp/<version>"; an app caller with no users/{uid}.chatTermsAcceptedAt
// is refused a send (POST /api/portal/chat/messages) and an upload (POST
// /api/portal/chat/media) with code 'chat_terms'. Web callers are never gated.

export function isAppChatRequest(request: NextRequest): boolean {
  return /\b3CPortalApp\//.test(request.headers.get('user-agent') ?? '');
}

/** The refusal body for an app caller with no chat agreement on file. */
export const CHAT_TERMS_REFUSAL = { error: 'Agree to the team chat rules first.', code: 'chat_terms' } as const;

/** Whether an app caller still owes the chat agreement (web callers never do). */
export function needsChatTerms(user: { chatTermsAccepted?: boolean }, request: NextRequest): boolean {
  return user.chatTermsAccepted === false && isAppChatRequest(request);
}
