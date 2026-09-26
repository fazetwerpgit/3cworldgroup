// The Ask 3C conversation contract, shared by the rep page and POST /api/portal/ask.

/** Turns (a question and its answer) the page keeps and sends back each time. */
export const ASK_HISTORY_TURNS = 10;
export const MAX_QUESTION_CHARS = 2000;
/** An earlier answer sent back as history; longer ones are cut. */
const MAX_HISTORY_CHARS = 4000;
/**
 * The rep page keeps its conversation in sessionStorage under this key, tagged
 * with the rep's uid. Sign-out removes it so a shared phone never shows (or
 * sends) one rep's conversation to the next.
 */
export const ASK_CONVERSATION_KEY = 'ask3c-conversation';

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
  /** For a follow-up: the rep's previous question in that conversation (redacted, cut to 200 characters). */
  prevQuestion: string | null;
  hadPhoto: boolean;
  answer: string;
  /** The answer before the fact-check pass changed it; null when the check left it alone. */
  draft: string | null;
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

export type AnswerPart =
  | { kind: 'text'; text: string }
  | { kind: 'phone'; text: string; tel: string }
  | { kind: 'link'; text: string; href: string };

// An https link, or a US number as the notes would write it: 512-555-0142,
// (512) 555-0142, 512.555.0142, 1-800-555-0142, or 10/11 digits run together.
// The link comes first, so digits inside a URL stay part of it.
const LINK_OR_PHONE =
  /(https:\/\/[^\s<>"']+)|(?<![\w+])(?:\+?1[\s.-]?)?(?:\(\d{3}\)\s?|\d{3}[\s.-]?)\d{3}[\s.-]?\d{4}(?!\w)/g;
/** Sentence punctuation (or a closing bracket) after a URL is not part of it. */
const URL_TAIL = /[.,;:!?'")\]]+$/;

/**
 * An answer as the page shows it: markdown marks the model slipped in are
 * dropped (the page shows plain text), and each line is split so https links
 * open and phone numbers are tap-to-call. Anything else stays text.
 */
export function answerLines(answer: string): AnswerPart[][] {
  const plain = answer
    .replace(/\*\*/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n');
  return plain.split('\n').map((line) => {
    const parts: AnswerPart[] = [];
    let text = '';
    let at = 0;
    for (const match of line.matchAll(LINK_OR_PHONE)) {
      const start = match.index ?? 0;
      text += line.slice(at, start);
      at = start + match[0].length;
      let part: AnswerPart | null = null;
      let tail = '';
      if (match[1]) {
        const url = match[1].replace(URL_TAIL, '');
        tail = match[1].slice(url.length);
        // new URL, not URL.canParse: iOS 16 Safari lacks canParse.
        try {
          part = { kind: 'link', text: url, href: new URL(url).href };
        } catch {
          part = null;
        }
      } else {
        const digits = match[0].replace(/\D/g, '');
        part = { kind: 'phone', text: match[0], tel: digits.length === 11 ? `+${digits}` : `+1${digits}` };
      }
      if (!part) {
        text += match[0];
        continue;
      }
      if (text) parts.push({ kind: 'text', text });
      parts.push(part);
      text = tail;
    }
    text += line.slice(at);
    if (text) parts.push({ kind: 'text', text });
    return parts;
  });
}
