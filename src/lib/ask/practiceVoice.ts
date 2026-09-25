// Practice talk mode, the pure parts: which of the browser's voices reads a
// homeowner's line, and what of the line gets read. Speech runs on the phone
// (speechSynthesis / SpeechRecognition); no audio leaves it.

/** The fields of a SpeechSynthesisVoice this needs. */
export interface VoiceLike {
  name: string;
  lang: string;
}

// Voice names that read as a woman's or a man's (Apple, Google, Microsoft, Amazon).
const FEMALE = /\b(female|woman|samantha|victoria|allison|ava|susan|zoe|nicky|aria|jenny|michelle|emma|joanna|salli|kendra|kimberly|ivy|ana|sara|nancy|karen|moira|tessa|serena|kate|google us english)\b/i;
const MALE = /\b(male|man|alex|daniel|fred|tom|aaron|evan|nathan|guy|davis|tony|jason|eric|christopher|roger|steffan|joey|justin|matthew|reed|brian|oliver|arthur)\b/i;
// macOS / iOS novelty voices: never a homeowner.
const NOVELTY = /\b(albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|junior|ralph|kathy|princess|deranged|hysterical|grandma|grandpa|rocko|shelley|sandy|flo|eddy)\b/i;
const NATURAL = /natural|neural|premium|enhanced|online/i;

/**
 * The voice for a homeowner: US English over other English, natural-sounding
 * over robotic, the homeowner's gender when the name tells, then the seed picks
 * among equals so the same session always sounds the same. Undefined when the
 * phone has no English voice (the browser default then reads it).
 */
export function pickVoice<V extends VoiceLike>(voices: readonly V[], gender: 'f' | 'm', seed: number): V | undefined {
  const ranked: { voice: V; score: number }[] = [];
  for (const voice of voices) {
    const lang = voice.lang.replace('_', '-').toLowerCase();
    if (!lang.startsWith('en') || NOVELTY.test(voice.name)) continue;
    const female = FEMALE.test(voice.name);
    const male = !female && MALE.test(voice.name);
    let score = lang === 'en-us' ? 10 : 0;
    if (NATURAL.test(voice.name)) score += 3;
    else if (/google/i.test(voice.name)) score += 2;
    if ((gender === 'f' && female) || (gender === 'm' && male)) score += 4;
    else if (female || male) score -= 4;
    ranked.push({ voice, score });
  }
  if (ranked.length === 0) return undefined;
  const best = Math.max(...ranked.map((entry) => entry.score));
  const top = ranked.filter((entry) => entry.score === best);
  return top[seed % top.length].voice;
}

/** A homeowner line as it is read aloud: no (stage directions), no end marker. */
export function spokenText(line: string): string {
  return line
    .replace(/\[\s*END\s*\]/gi, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
