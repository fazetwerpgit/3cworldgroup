// Team chat content filter (App Store guideline 1.2: a method for filtering
// objectionable material). Deliberately small, so normal sales-floor talk is
// never touched:
//
//   SLURS            reject the message with a friendly error. No masked
//                    version of a slur is acceptable to post.
//   MASKED_SLURS     masked in place ("k***"), message still sends: words that
//                    are slurs in most uses but also appear in quoted or
//                    reclaimed speech, where a hard refusal does more harm.
//   SEVERE_PROFANITY masked in place ("f***"), message still sends. Everyday
//                    swearing (shit, damn, hell, ass, crap, bitch) is left
//                    alone on purpose: rejecting or starring it would annoy a
//                    sales team for no safety gain.
//
// Matching is whole-word (letters on either side means no match, so place
// names and ordinary words that contain a stem pass), case-insensitive, and
// sees through common character swaps (0->o, 1/!->i, 3->e, 4/@->a, $/5->s, 7->t),
// invisible characters (soft hyphen, zero-width space) and fullwidth letters.
// The text is checked in three forms (all swaps; all swaps except !/1; plain
// lowercase) and a hit in any counts: otherwise a trailing "!" or "1" ("fag!")
// would swap into a letter and hide the word boundary.
// "chink" is left out on purpose: "a chink in the armor" is ordinary speech.
// To change the lists, edit the stems below and the cases in
// contentFilter.test.ts. Each stem also matches the listed suffixes.

const SLUR_STEMS = [
  'nigger',
  'nigga',
  'faggot',
  'fag',
  'spic',
  'gook',
  'wetback',
  'beaner',
  'raghead',
  'towelhead',
  'retard',
] as const;

const MASKED_SLUR_STEMS = ['kike', 'tranny'] as const;

const SEVERE_PROFANITY_STEMS = ['fuck', 'motherfuck', 'cunt'] as const;

// Slurs take only plural/past endings, so "spicy" or "spicer" never match.
const SLUR_SUFFIXES = '(?:s|z|es|ed)?';
const PROFANITY_SUFFIXES = '(?:s|z|ed|er|ers|ing|in|y|a|as)?';

const SWAPS: Record<string, string> = { '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', $: 's', '5': 's', '7': 't' };
// The same swaps minus the two that are also everyday punctuation/digits after a
// word ("fag!", "r3tard1"), so a swapped stem followed by one still matches.
const SWAPS_KEEP_I: Record<string, string> = Object.fromEntries(
  Object.entries(SWAPS).filter(([from]) => from !== '!' && from !== '1')
);
const NO_SWAPS: Record<string, string> = {};

// Characters that render as nothing (soft hyphen, zero-width space/joiners,
// BOM, variation selectors...): dropped before matching so "f\u00ADuck" can't
// hide a word. Fullwidth and other compatibility forms ("\uFF46\uFF55\uFF43\uFF4B") are
// folded with NFKC for the same reason.
const INVISIBLE_RE = /^\p{Default_Ignorable_Code_Point}$/u;

type Normalized = {
  /** The text to match against. */
  form: string;
  /** For each code unit of `form`: the [start, end) code-unit range in the original text it came from. */
  origin: Array<[number, number]>;
};

/**
 * Lowercased, NFKC-folded, invisible characters removed, swaps applied, with
 * a map from each matched position back onto the original text.
 * `swaps` picks the character-swap table (NO_SWAPS gives plain lowercase).
 */
function normalize(text: string, swaps: Record<string, string> = SWAPS): Normalized {
  let form = '';
  const origin: Array<[number, number]> = [];
  let index = 0;
  for (const ch of text) {
    const start = index;
    index += ch.length;
    if (INVISIBLE_RE.test(ch)) continue;
    for (const folded of ch.normalize('NFKC').toLowerCase()) {
      const swapped = swaps[folded] ?? folded;
      form += swapped;
      for (let k = 0; k < swapped.length; k += 1) origin.push([start, index]);
    }
  }
  return { form, origin };
}

function wordPattern(stems: readonly string[], suffixes: string): RegExp {
  // Longest first so "motherfuck" wins over "fuck".
  const alternation = [...stems].sort((a, b) => b.length - a.length).join('|');
  return new RegExp(`(?<![a-z])(?:${alternation})${suffixes}(?![a-z])`, 'g');
}

const SLUR_RE = wordPattern(SLUR_STEMS, SLUR_SUFFIXES);
const SEVERE_RE = wordPattern(SEVERE_PROFANITY_STEMS, PROFANITY_SUFFIXES);
const MASKED_SLUR_RE = wordPattern(MASKED_SLUR_STEMS, SLUR_SUFFIXES);

export const CHAT_FILTER_REJECT_MESSAGE =
  "That message has language we don't allow in team chat. Edit it and try again.";

export type ChatTextCheck = { ok: true; text: string; masked: boolean } | { ok: false; error: string };

/** Rejects slurs; masks severe profanity and the mask-only slurs (first letter kept); passes everything else unchanged. */
export function checkChatText(text: string): ChatTextCheck {
  if (!text) return { ok: true, text, masked: false };
  const forms = [normalize(text), normalize(text, SWAPS_KEEP_I), normalize(text, NO_SWAPS)];
  if (forms.some(({ form }) => new RegExp(SLUR_RE.source).test(form))) {
    return { ok: false, error: CHAT_FILTER_REJECT_MESSAGE };
  }

  let masked = false;
  const chars = text.split('');
  for (const { form, origin } of forms) {
    for (const re of [SEVERE_RE, MASKED_SLUR_RE]) {
      for (const match of form.matchAll(re)) {
        masked = true;
        const start = match.index ?? 0;
        // Keep the first original character; star everything after it up to the
        // end of the match (invisible characters inside the word included).
        const from = origin[start][1];
        const to = origin[start + match[0].length - 1][1];
        for (let i = from; i < to; i += 1) chars[i] = '*';
      }
    }
  }
  return { ok: true, text: masked ? chars.join('') : text, masked };
}

/**
 * For short user-supplied labels that are not chat messages (a GIF search, an
 * attachment's file name): true when the filter would refuse or mask it.
 */
export function isFilteredLabel(text: string): boolean {
  const check = checkChatText(text);
  return !check.ok || check.masked;
}
