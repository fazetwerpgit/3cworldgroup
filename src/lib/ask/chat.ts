// The Ask 3C conversation contract, shared by the rep page and POST /api/portal/ask.

/** Turns (a question and its answer) the page keeps and sends back each time. */
export const ASK_HISTORY_TURNS = 10;
export const MAX_QUESTION_CHARS = 2000;
/** An earlier answer sent back as history; longer ones are cut. */
const MAX_HISTORY_CHARS = 4000;

export interface AskTurnMessage {
  role: 'user' | 'assistant';
  text: string;
}

/** POST /api/portal/ask answers 200 with this. */
export interface AskReply {
  id: string;
  answer: string;
}

/** One exchange on the owner's Questions tab (GET /api/portal/knowledge/questions). */
export interface AskLogView {
  id: string;
  repName: string;
  question: string;
  hadPhoto: boolean;
  answer: string;
  rating: 'up' | 'down' | null;
  createdAt: string | null;
}

/** The last ASK_HISTORY_TURNS turns of a client-sent history; anything malformed is dropped. */
export function parseHistory(raw: unknown): AskTurnMessage[] {
  if (!Array.isArray(raw)) return [];
  const messages: AskTurnMessage[] = [];
  for (const item of raw) {
    const role = (item as { role?: unknown } | null)?.role;
    const text = (item as { text?: unknown } | null)?.text;
    if ((role !== 'user' && role !== 'assistant') || typeof text !== 'string' || !text.trim()) continue;
    messages.push({ role, text: text.trim().slice(0, MAX_HISTORY_CHARS) });
  }
  return messages.slice(-ASK_HISTORY_TURNS * 2);
}

export type AnswerPart = { kind: 'text'; text: string } | { kind: 'phone'; text: string; tel: string };

// A US number as the notes would write it: 512-555-0142, (512) 555-0142,
// 512.555.0142, 1-800-555-0142, or 10/11 digits run together.
const PHONE_IN_ANSWER = /(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;

/**
 * An answer as the page shows it: markdown marks the model slipped in are
 * dropped (the page shows plain text), and each line is split so phone numbers
 * render as tap-to-call links.
 */
export function answerLines(answer: string): AnswerPart[][] {
  const plain = answer
    .replace(/\*\*|__/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  return plain.split('\n').map((line) => {
    const parts: AnswerPart[] = [];
    let at = 0;
    for (const match of line.matchAll(PHONE_IN_ANSWER)) {
      const start = match.index ?? 0;
      if (start > at) parts.push({ kind: 'text', text: line.slice(at, start) });
      const digits = match[0].replace(/\D/g, '');
      parts.push({ kind: 'phone', text: match[0], tel: digits.length === 11 ? `+${digits}` : `+1${digits}` });
      at = start + match[0].length;
    }
    if (at < line.length) parts.push({ kind: 'text', text: line.slice(at) });
    return parts;
  });
}
