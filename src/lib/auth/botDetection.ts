// Conservative heuristic for flagging bot-generated signups (gibberish local
// parts / display names) without requiring invite codes. Tuned against a
// battery of real-looking and generated-looking examples — see
// botDetection.test.ts. Scores several independent signals and only flags
// when at least two fire (a single overwhelming signal counts double).

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u', 'y']);

function isVowel(ch: string): boolean {
  return VOWELS.has(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isLetter(ch: string): boolean {
  return ch >= 'a' && ch <= 'z';
}

/**
 * Longest run of consecutive consonant letters — vowels, digits and
 * separators all break the run. This is the "letter-run with no vowels"
 * signal: real words interleave vowels every few letters, so a run of 6+
 * consonants in a row is a strong gibberish signal.
 */
function longestConsonantRun(s: string): number {
  let best = 0;
  let run = 0;
  for (const ch of s) {
    if (isLetter(ch) && !isVowel(ch)) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 0;
    }
  }
  return best;
}

/**
 * Letter<->digit transition count, excluding a single trailing contiguous
 * digit group (so "jacobmyers692" is treated as the letters-only
 * "jacobmyers" with 0 transitions, not penalized for a normal trailing
 * birth-year/number suffix).
 */
function alternationTransitions(alnum: string): number {
  const trailingDigits = alnum.match(/\d+$/);
  const remainder = trailingDigits ? alnum.slice(0, alnum.length - trailingDigits[0].length) : alnum;

  let transitions = 0;
  let prevType: 'd' | 'l' | null = null;
  for (const ch of remainder) {
    const type = isDigit(ch) ? 'd' : isLetter(ch) ? 'l' : null;
    if (type === null) continue;
    if (prevType !== null && type !== prevType) transitions += 1;
    prevType = type;
  }
  return transitions;
}

/** True if alnum has >=14 chars and its digits are not purely a trailing group. */
function hasLongInterleavedDigits(alnum: string): boolean {
  if (alnum.length < 14) return false;
  const trailingDigits = alnum.match(/\d+$/);
  const remainder = trailingDigits ? alnum.slice(0, alnum.length - trailingDigits[0].length) : alnum;
  return /\d/.test(remainder);
}

function letterVowelRatio(token: string): number | null {
  let letters = 0;
  let vowels = 0;
  for (const ch of token) {
    if (isLetter(ch)) {
      letters += 1;
      if (isVowel(ch)) vowels += 1;
    }
  }
  if (letters === 0) return null;
  return vowels / letters;
}

function isHexLikeToken(token: string): boolean {
  if (token.length < 8) return false;
  if (!/^[0-9a-f]+$/.test(token)) return false;
  return /\d/.test(token) && /[a-f]/.test(token);
}

function emailScore(email: string): number {
  const trimmed = email.trim().toLowerCase();
  const at = trimmed.indexOf('@');
  const rawLocal = at === -1 ? trimmed : trimmed.slice(0, at);
  // Strip a +tag suffix (e.g. "jane+signup" -> "jane") before analysis.
  const local = rawLocal.replace(/\+.*$/, '');
  if (!local) return 0;

  const tokens = local.split(/[._-]+/).filter(Boolean);
  const alnum = local.replace(/[._-]+/g, '');

  let score = 0;

  const runLen = longestConsonantRun(local);
  let runContribution = 0;
  if (runLen >= 9) runContribution = 2;
  else if (runLen >= 6) runContribution = 1;

  let vowelRatioContribution = 0;
  for (const token of tokens) {
    if (token.length >= 8) {
      const ratio = letterVowelRatio(token);
      if (ratio !== null && ratio < 0.2) {
        vowelRatioContribution = 1;
        break;
      }
    }
  }

  // For a purely alphabetic local part, the consonant-run and low-vowel-ratio
  // signals are largely the same evidence counted twice (a long run of
  // consonants necessarily drags the vowel ratio down) — that double count
  // is what falsely blocked real consonant-heavy surnames like
  // "hirschsprung". Cap their combined contribution at 1, unless the run is
  // so extreme (>=9) that it's overwhelming on its own and worth the +2
  // regardless of the vowel-ratio signal riding along with it. Digit-bearing
  // local parts are unaffected — they're covered by the alternation/hex/
  // interleaved-digit signals instead.
  const localHasDigits = /\d/.test(local);
  if (!localHasDigits && runLen < 9) {
    score += Math.min(1, runContribution + vowelRatioContribution);
  } else {
    score += runContribution + vowelRatioContribution;
  }

  const transitions = alternationTransitions(alnum);
  if (transitions >= 6) score += 2;
  else if (transitions >= 4) score += 1;

  if (hasLongInterleavedDigits(alnum)) score += 1;

  for (const token of tokens) {
    if (isHexLikeToken(token)) {
      score += 1;
      break;
    }
  }

  return score;
}

function nameScore(displayName: string): number {
  const name = displayName.trim();
  if (!name) return 0;

  let score = 0;

  if (/\d/.test(name)) score += 1;

  const words = name.split(/\s+/).filter(Boolean);
  for (const word of words) {
    const letters = word.toLowerCase().replace(/[^a-z]/g, '');
    if (letters.length >= 5 && !/[aeiouy]/.test(letters)) {
      score += 1;
      break;
    }
  }

  if (words.length === 1) {
    const single = words[0].toLowerCase();
    const alphaOnly = single.replace(/[^a-z]/g, '');
    if (alphaOnly.length >= 12) {
      const ratio = letterVowelRatio(alphaOnly);
      if (ratio !== null && ratio < 0.25) score += 1;
    }
  }

  return score;
}

/**
 * Flags obviously bot-generated signups (gibberish email local parts and/or
 * display names). Deliberately conservative: normal human emails/names
 * (dotted names, birth-year suffixes, short handles, non-English names)
 * must never trigger this. See botDetection.test.ts for the required battery.
 */
export function looksLikeBotSignup(email: string, displayName: string): boolean {
  const score = emailScore(email) + nameScore(displayName);
  return score >= 2;
}
