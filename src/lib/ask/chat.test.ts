import { describe, expect, it } from 'vitest';
import { answerLines } from './chat';

// How an answer's lines split into text, tap-to-call numbers and links.

describe('answerLines', () => {
  it('links an https URL without its trailing sentence punctuation', () => {
    expect(answerLines('See https://example.test/help?a=1_2.')).toEqual([
      [
        { kind: 'text', text: 'See ' },
        { kind: 'link', text: 'https://example.test/help?a=1_2', href: 'https://example.test/help?a=1_2' },
        { kind: 'text', text: '.' },
      ],
    ]);
  });

  it('leaves http and other schemes as plain text', () => {
    expect(answerLines('Go to http://example.test or javascript:alert(1)')).toEqual([
      [{ kind: 'text', text: 'Go to http://example.test or javascript:alert(1)' }],
    ]);
  });

  it('keeps digits inside a URL part of the link, and still finds a phone number after it', () => {
    const [line] = answerLines('Open https://example.test/5125550142 or call (512) 555-0142');
    expect(line.map((part) => part.kind)).toEqual(['text', 'link', 'text', 'phone']);
    expect(line[3]).toEqual({ kind: 'phone', text: '(512) 555-0142', tel: '+15125550142' });
  });

  it('drops bold marks and headings, one entry per line', () => {
    expect(answerLines('## Steps\n**1.** Call 1-800-555-0100')).toEqual([
      [{ kind: 'text', text: 'Steps' }],
      [
        { kind: 'text', text: '1. Call ' },
        { kind: 'phone', text: '1-800-555-0100', tel: '+18005550100' },
      ],
    ]);
  });
});
