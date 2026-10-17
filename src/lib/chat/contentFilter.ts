// Team chat content filter (App Store guideline 1.2: a method for filtering
// objectionable material). Deliberately small, so normal sales-floor talk is
// never touched:
//
//   SLURS            reject the message with a friendly error. No masked
//                    version of a slur is acceptable to post.
//   SEVERE_PROFANITY masked in place ("f***"), message still sends. Everyday
//                    swearing (shit, damn, hell, ass, crap, bitch) is left
//                    alone on purpose: rejecting or starring it would annoy a
//                    sales team for no safety gain.
//
// Matching is whole-word (letters on either side means no match, so place
// names and ordinary words that contain a stem pass), case-insensitive, and
// sees through common character swaps (0->o, 1->i, 3->e, 4/@->a, $/5->s, 7->t).
// "chink" is left out on purpose: "a chink in the armor" is ordinary speech.
// To change the lists, edit the stems below and the cases in
// contentFilter.test.ts. Each stem also matches the listed suffixes.

const SLUR_STEMS = [
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'kike',
  'spic',
  'gook',
  'wetback',
  'beaner',
  'raghead',
  'towelhead',
  'tranny',
  'retard',
] as const;

const SEVERE_PROFANITY_STEMS = ['fuck', 'motherfuck', 'cunt'] as const;

// Slurs take only plural/past endings, so "spicy" or "spicer" never match.
const SLUR_SUFFIXES = '(?:s|z|es|ed)?';
const PROFANITY_SUFFIXES = '(?:s|z|ed|er|ers|ing|in|y|a|as)?';

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', $: 's', '5': 's', '7': 't' };

/** Same length as the input, so match indices map straight back onto it. */
function normalize(text: string): string {
  let out = '';
  for (const ch of text) {
    const lower = ch.toLowerCase();
    // Keep a 1:1 code-unit mapping: anything that lowercases to a different length passes through.
    const swapped = SWAPS[lower] ?? lower;
    out += swapped.length === ch.length ? swapped : ch;
  }
  return out;
}

function wordPattern(stems: readonly string[], suffixes: string): RegExp {
  // Longest first so "motherfuck" wins over "fuck".
  const alternation = [...stems].sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?<![a-z])(?:${alternation})${suffixes}(?![a-z])`, 'g');
}

const SLUR_RE = wordPattern(SLUR_STEMS, SLUR_SUFFIXES);
const SEVERE_RE = wordPattern(SEVERE_PROFANITY_STEMS, PROFANITY_SUFFIXES);

export const CHAT_FILTER_REJECT_MESSAGE =
  "That message has language we don't allow in team chat. Edit it and try again.";

export type ChatTextCheck = { ok: true; text: string; masked: boolean } | { ok: false; error: string };

/** Rejects slurs; masks severe profanity (first letter kept); passes everything else unchanged. */
export function checkChatText(text: string): ChatTextCheck {
  if (!text) return { ok: true, text, masked: false };
  const normalized = normalize(text);
  SLUR_RE.lastIndex = 0;
  if (SLUR_RE.test(normalized)) return { ok: false, error: CHAT_FILTER_REJECT_MESSAGE };

  let masked = false;
  const chars = text.split('');
  for (const match of normalized.matchAll(SEVERE_RE)) {
    masked = true;
    const start = match.index ?? 0;
    for (let i = start + 1; i < start + match[0].length; i += 1) chars[i] = '*';
  }
  return { ok: true, text: masked ? chars.join('') : text, masked };
}
