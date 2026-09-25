import { describe, expect, it } from 'vitest';
import { pickVoice, spokenText } from './practiceVoice';

// Talk mode's pure parts: which voice reads the homeowner, and what gets read.

const voices = [
  { name: 'Bad News', lang: 'en-US' },
  { name: 'Daniel', lang: 'en-GB' },
  { name: 'Samantha', lang: 'en-US' },
  { name: 'Alex', lang: 'en-US' },
  { name: 'Microsoft Aria Online (Natural) - English (United States)', lang: 'en-US' },
  { name: 'Microsoft Guy Online (Natural) - English (United States)', lang: 'en-US' },
  { name: 'Amélie', lang: 'fr-CA' },
];

describe('pickVoice', () => {
  it('prefers a natural US voice of the homeowner’s gender', () => {
    expect(pickVoice(voices, 'f', 0)?.name).toContain('Aria');
    expect(pickVoice(voices, 'm', 0)?.name).toContain('Guy');
  });

  it('falls back to any US voice, never a novelty or non-English one', () => {
    const plain = [
      { name: 'Bad News', lang: 'en-US' },
      { name: 'Samantha', lang: 'en_US' },
      { name: 'Amélie', lang: 'fr-CA' },
    ];
    expect(pickVoice(plain, 'm', 5)?.name).toBe('Samantha');
    expect(pickVoice([{ name: 'Amélie', lang: 'fr-CA' }], 'f', 0)).toBeUndefined();
  });

  it('lets the seed choose among equally good voices, the same one every time', () => {
    const twins = [
      { name: 'Voice One', lang: 'en-US' },
      { name: 'Voice Two', lang: 'en-US' },
    ];
    expect(pickVoice(twins, 'f', 0)?.name).toBe('Voice One');
    expect(pickVoice(twins, 'f', 1)?.name).toBe('Voice Two');
    expect(pickVoice(twins, 'f', 3)).toBe(pickVoice(twins, 'f', 3));
  });
});

describe('spokenText', () => {
  it('drops stage directions and the end marker', () => {
    expect(spokenText("(opens the door) Hi, can I help you? (sighs) Fine. [END]")).toBe('Hi, can I help you? Fine.');
    expect(spokenText('(closes the door)')).toBe('');
  });
});
