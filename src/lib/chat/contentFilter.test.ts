import { describe, expect, it } from 'vitest';
import { CHAT_FILTER_REJECT_MESSAGE, checkChatText } from './contentFilter';

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
    expect(checkChatText('Kikes? No: Kikeri is a client name').ok).toBe(false);
    expect(checkChatText('Kikeri is a client name').ok).toBe(true);
  });
});
