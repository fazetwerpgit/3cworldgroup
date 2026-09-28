// Practice hands-free: the rep talks without tapping. The phone streams the
// mic to Gemini live transcription (gemini-3.5-transcribe-live over a
// WebSocket, with a short-lived token our server mints and locks to that
// model and config); a pause ends the rep's line and it goes to the usual
// practice turn. The homeowner cuts in on a rep who talks too long: at
// CUT_IN_PREPARE of the talk budget the interruption is written and its voice
// fetched, and at the full budget it plays over the rep. Shared by the routes
// and the page.

/** The live transcription model (Gemini API, Live transcription). */
export const LISTEN_MODEL = 'gemini-3.5-transcribe-live';

/** Words the rep says that a general model would mishear. */
export const LISTEN_VOCAB = [
  '3C',
  '3C World Group',
  'T-Mobile',
  'T-Mobile Fiber',
  'T-Fiber',
  'fiber',
  'Spectrum',
  'Xfinity',
  'Comcast',
  'AT&T',
  'AT&T Fiber',
  'CenturyLink',
  'Mediacom',
  'AutoPay',
  'Mbps',
  'gig',
  'install',
  'router',
];

/** The setup a listen token is locked to: the browser can't change the model or turn it into anything else. */
export const LISTEN_SETUP = {
  model: `models/${LISTEN_MODEL}`,
  generationConfig: { responseModalities: ['TEXT'] },
  inputAudioTranscription: { languageCodes: ['en-US'], customVocabulary: LISTEN_VOCAB },
} as const;

/** The token opens one session within a minute; the session may run this long (a practice is a few minutes). */
export const LISTEN_OPEN_MS = 60_000;
export const LISTEN_SESSION_MS = 12 * 60_000;

/** Where the browser connects with the token. */
export const LISTEN_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';

/** POST /api/portal/ask/practice/listen answers 200 with this. */
export interface PracticeListenReply {
  token: string;
  url: string;
}

/** At this share of the talk budget the interruption is written and its voice fetched. */
export const CUT_IN_PREPARE = 0.7;

/**
 * How long the rep may talk in one go before the homeowner cuts in: a patient
 * homeowner (patience 5) gives 25 s, an impatient one (3) 10 s, and it shrinks
 * as they lose patience, to no less than 8 s.
 */
export function talkBudgetMs(startPatience: number, patience: number): number {
  const base = 10_000 + (Math.min(5, Math.max(3, startPatience)) - 3) * 7_500;
  const share = startPatience > 0 ? Math.max(0, Math.min(1, patience / startPatience)) : 1;
  return Math.max(8_000, Math.round(base * (0.5 + 0.5 * share)));
}

const words = (text: string) =>
  text
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

/**
 * The words the mic heard that aren't the homeowner's own line coming back
 * through the speaker. While the homeowner talks, only these count as the rep
 * talking over them (the phone's echo cancelling isn't perfect with the
 * speaker next to the mic).
 */
export function nonEchoWords(heard: string, homeowner: string): string[] {
  const theirs = new Set(words(homeowner));
  return words(heard).filter((word) => !theirs.has(word));
}

/** This many words of the rep's own while the homeowner talks: they're talking over them, and the homeowner stops. */
export const BARGE_IN_WORDS = 3;
