import { describe, expect, it } from 'vitest';
import { CHAT_FILTER_REJECT_MESSAGE, checkChatText, isFilteredLabel } from './contentFilter';

describe('checkChatText', () => {
  it('leaves normal sales talk alone, swearing included', () => {
    const lines = [
      'Closed 4 doors on Maple, fiber install Tuesday',
      'Damn, that HOA was rough. Shit happens, back at it tomorrow',
      'Who has the Scunthorpe lead? Spice up the pitch',
      'Niger Street apartments are all fiber ready',
      'Assessing the classic grass hut neighborhood, what a hell of a day',
      'Found the chink in their armor: price lock',
      'Spicer and Spicy are on the Elm route',
    ];
    for (const line of lines) expect(checkChatText(line)).toEqual({ ok: true, text: line, masked: false });
  });

  it('rejects slurs, through case, suffixes and character swaps', () => {
    for (const line of ['you f4ggot', 'FAGS', 'what a retard', 'such a r3tarded call', 'n1gga please']) {
      expect(checkChatText(line)).toEqual({ ok: false, error: CHAT_FILTER_REJECT_MESSAGE });
    }
  });

  it('masks severe profanity but still sends', () => {
    expect(checkChatText('Fuck yes, 5 installs')).toEqual({ ok: true, text: 'F*** yes, 5 installs', masked: true });
    expect(checkChatText('that motherfucker cancelled')).toEqual({ ok: true, text: 'that m*********** cancelled', masked: true });
    expect(checkChatText('f*ck it, fucking rain')).toEqual({ ok: true, text: 'f*ck it, f****** rain', masked: true });
  });

  it('does not match inside other words', () => {
    expect(checkChatText('Spicy wings at the team lunch').ok).toBe(true);
    expect(checkChatText('Kikes? No: Kikeri is a client name')).toEqual({ ok: true, text: 'K****? No: Kikeri is a client name', masked: true });
    expect(checkChatText('Kikeri is a client name')).toEqual({ ok: true, text: 'Kikeri is a client name', masked: false });
  });

  it('catches a slur followed by "!" or "1", which the swaps would otherwise turn into a letter', () => {
    for (const line of ['retard!', 'fag!', 'what a retard!!', 'FAG1', 'retard1', 'r3tard!', 'f4g!']) {
      expect(checkChatText(line)).toEqual({ ok: false, error: CHAT_FILTER_REJECT_MESSAGE });
    }
    // A swap inside the word still counts.
    expect(checkChatText('n!gga').ok).toBe(false);
  });

  it('masks profanity followed by "!" or "1" too', () => {
    expect(checkChatText('fuck!')).toEqual({ ok: true, text: 'f***!', masked: true });
    expect(checkChatText('fuck1')).toEqual({ ok: true, text: 'f***1', masked: true });
  });

  it('masks, rather than refuses, the mask-only slurs', () => {
    expect(checkChatText('kike')).toEqual({ ok: true, text: 'k***', masked: true });
    expect(checkChatText('tranny!')).toEqual({ ok: true, text: 't*****!', masked: true });
    expect(checkChatText('tr4nny')).toEqual({ ok: true, text: 't*****', masked: true });
  });
  it('sees through invisible characters and fullwidth letters', () => {
    for (const line of ['n\u00ADigger', 'fa\u200Bggot', 're\u200Dtard', '\uFF4E\uFF49\uFF47\uFF47\uFF41', 'f\uFEFFag!']) {
      expect(checkChatText(line)).toEqual({ ok: false, error: CHAT_FILTER_REJECT_MESSAGE });
    }
    expect(checkChatText('fu\u200Bck you')).toEqual({ ok: true, text: 'f**** you', masked: true });
    expect(checkChatText('\uFF46\uFF55\uFF43\uFF4B it')).toEqual({ ok: true, text: '\uFF46*** it', masked: true });
    expect(checkChatText('k\u00ADike')).toEqual({ ok: true, text: 'k****', masked: true });
    // Clean text with the same characters passes through untouched.
    expect(checkChatText('Great\u200B job \uFF01')).toEqual({ ok: true, text: 'Great\u200B job \uFF01', masked: false });
  });
});

describe('isFilteredLabel', () => {
  it('flags a label the filter would refuse or mask, and passes clean ones', () => {
    expect(isFilteredLabel('retard')).toBe(true);
    expect(isFilteredLabel('fuck yeah')).toBe(true);
    expect(isFilteredLabel('kike')).toBe(true);
    expect(isFilteredLabel('celebrate')).toBe(false);
    expect(isFilteredLabel('Pay stub.pdf')).toBe(false);
    expect(isFilteredLabel('')).toBe(false);
  });
});
