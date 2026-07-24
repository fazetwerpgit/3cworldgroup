import { describe, it, expect } from 'vitest';
import { looksLikeBotSignup } from './botDetection';

describe('looksLikeBotSignup — must NOT flag real human signups', () => {
  const cases: Array<[string, string]> = [
    ['jacobmyers692@gmail.com', 'Jacob Myers'],
    ['mary.smith88@yahoo.com', 'Mary Smith'],
    ['krzysztof.nowak@gmail.com', 'Krzysztof Nowak'],
    ['d.jones2@outlook.com', 'D Jones'],
    ['tj_hunt@gmail.com', 'TJ Hunt'],
    ['baileyw@gmail.com', 'Bailey Williams'],
    ['xochitl123@gmail.com', 'Xochitl Ramirez'],
    ['john.smith@gmail.com', 'John Smith'],
    ['sarah_oconnor@icloud.com', "Sarah O'Connor"],
    ['mvp.hernandez7@gmail.com', 'MVP Hernandez'],
    ['bg2024@gmail.com', 'Bailey Green'],
    // Consonant-heavy real surnames: the consonant-run and low-vowel-ratio
    // signals used to double-count the same evidence and falsely block
    // these. See the "false positive" describe block below for the traced
    // case.
    ['hirschsprung@gmail.com', 'Ida Hirschsprung'],
    ['schwartz@gmail.com', 'Anna Schwartz'],
    ['nguyen.tran@gmail.com', 'Nguyen Tran'],
    ['jose@gmail.com', 'José'],
    ['zoe@gmail.com', 'Zoë'],
    ['christopherwashington@gmail.com', 'Christopher Washington'],
  ];

  for (const [email, name] of cases) {
    it(`allows ${email} / ${name}`, () => {
      expect(looksLikeBotSignup(email, name)).toBe(false);
    });
  }
});

describe('looksLikeBotSignup — consonant-run / vowel-ratio double-count fix', () => {
  it('does not flag a consonant-heavy real surname on its own', () => {
    // "hirschsprung": longest consonant run is 7 (r-s-c-h-s-p-r), and the
    // whole-token vowel ratio is 2/12 (~0.167) < 0.2 — both signals used to
    // fire independently for +1 each, scoring 2 on email alone and blocking
    // the signup outright. They're now capped to a combined +1 since the
    // run is < 9, so email scores 1 and (with a name score of 0) the total
    // stays under the flag threshold of 2.
    expect(looksLikeBotSignup('hirschsprung@gmail.com', 'Ida Hirschsprung')).toBe(false);
  });

  it('still flags gibberish that scores 1 on email alone when paired with a suspicious name', () => {
    // "asdkjfhaksjdf" also has its run+vowel-ratio contribution capped to 1,
    // but a digit-bearing gibberish display name still pushes the total to
    // the flag threshold.
    expect(looksLikeBotSignup('asdkjfhaksjdf@gmail.com', 'user 8372')).toBe(true);
  });

  it('accepts vowel-sprinkled all-letter gibberish paired with a plausible name (accepted trade-off)', () => {
    // Owner-approved trade-off: once the run+vowel-ratio signals are capped
    // to avoid false-blocking real surnames, an all-letter gibberish local
    // part paired with an ordinary-looking name no longer accumulates
    // enough score to flag. False positives (blocking real users) are worse
    // than this narrow leakage, and the error message already tells
    // legitimate users to ask their manager if they get blocked.
    expect(looksLikeBotSignup('asdkjfhaksjdf@gmail.com', 'John Smith')).toBe(false);
  });

  it('still flags digit-alternating gibberish regardless of the cap', () => {
    // Digit alternation is a separate signal, untouched by the no-digit cap.
    expect(looksLikeBotSignup('x8f3k2j9qz@gmail.com', 'John Smith')).toBe(true);
  });

  it('still flags an extreme vowel-dropped handle on email alone (run >= 9 keeps its full weight)', () => {
    // "dvdthmpsn" has zero vowels at all, a consonant run of 9, which keeps
    // its full +2 weight uncapped — enough to flag on email score alone,
    // even paired with a completely ordinary name. Accepted collateral
    // (owner-approved trade-off) — a real user blocked this way is told by
    // the error message to ask their manager to set up their account.
    expect(looksLikeBotSignup('dvdthmpsn@gmail.com', 'John Smith')).toBe(true);
  });
});

describe('looksLikeBotSignup — must flag bot-looking signups', () => {
  const cases: Array<[string, string]> = [
    ['x8f3k2j9qz@gmail.com', 'Xkfjd Qwpzm'],
    ['ajd83hd72hd9@mail.ru', 'user 8372'],
    ['q1w2e3r4t5@gmail.com', 'asdkjfh'],
    ['asdkjfhaksjdf@gmail.com', 'Xkfjd Qwpzm'],
    ['9f8a7b6c5d@outlook.com', 'user 8372'],
    ['xkcdqwrtzp@gmail.com', 'asdkjfh'],
    ['fj39dk2m1x@hotmail.com', 'Xkfjd Qwpzm'],
  ];

  for (const [email, name] of cases) {
    it(`flags ${email} / ${name}`, () => {
      expect(looksLikeBotSignup(email, name)).toBe(true);
    });
  }

  it('flags a gibberish email even paired with a plausible display name', () => {
    expect(looksLikeBotSignup('x8f3k2j9qz@gmail.com', 'John Smith')).toBe(true);
  });
});

describe('looksLikeBotSignup — edge cases', () => {
  it('does not crash and does not flag on empty strings', () => {
    expect(looksLikeBotSignup('', '')).toBe(false);
  });

  it('does not crash on an email with no @', () => {
    expect(looksLikeBotSignup('notanemail', 'Jane Rep')).toBe(false);
  });

  it('does not flag an empty display name paired with a normal email', () => {
    expect(looksLikeBotSignup('jane.doe@gmail.com', '')).toBe(false);
  });

  it('strips a +tag suffix before analysis', () => {
    expect(looksLikeBotSignup('jacob.myers+signup@gmail.com', 'Jacob Myers')).toBe(false);
  });

  it('treats ., _, and - as equivalent separators', () => {
    expect(looksLikeBotSignup('mary-smith88@yahoo.com', 'Mary Smith')).toBe(false);
    expect(looksLikeBotSignup('mary_smith88@yahoo.com', 'Mary Smith')).toBe(false);
  });

  it('does not flag a short handle-style local part', () => {
    expect(looksLikeBotSignup('jr@gmail.com', 'James Rivera')).toBe(false);
  });

  it('does not flag a normal two-word display name with a digit-free short word', () => {
    expect(looksLikeBotSignup('amy.lee@gmail.com', 'Amy Lee')).toBe(false);
  });

  it('flags a display name that is a single long vowel-free token even with a normal email', () => {
    expect(looksLikeBotSignup('someone@gmail.com', 'Xkfjdqwpzmrx')).toBe(true);
  });
});
