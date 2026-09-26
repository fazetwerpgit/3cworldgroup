import { afterEach, describe, expect, it, vi } from 'vitest';
import { callAskModel } from './provider';

const config = { apiKey: 'k', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' };
const reply = (content: string, finish_reason = 'stop') =>
  new Response(JSON.stringify({ choices: [{ message: { content }, finish_reason }], usage: {} }), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('callAskModel with a cut-off answer', () => {
  it('uses the retry when it finishes', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('Try another card, or', 'length')).mockResolvedValueOnce(reply('Try another card.'));
    vi.stubGlobal('fetch', fetchMock);
    expect((await callAskModel(config, [{ role: 'user', content: 'declined' }])).answer).toBe('Try another card.');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('falls back to the cut-off text when the retry fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply('Try another card, or', 'length')).mockResolvedValueOnce(new Response('', { status: 500 })));
    expect((await callAskModel(config, [{ role: 'user', content: 'declined' }])).answer).toBe('Try another card, or');
  });
});

describe('callAskModel self-check', () => {
  it('returns the checked copy, and keeps the draft when the check fails', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(reply('Draft with a made-up claim.')).mockResolvedValueOnce(reply('Clean answer.'));
    vi.stubGlobal('fetch', fetchMock);
    expect((await callAskModel(config, [{ role: 'user', content: 'q' }], undefined, 'check it')).answer).toBe('Clean answer.');
    const sent = JSON.parse(fetchMock.mock.calls[1][1].body).messages;
    expect(sent.slice(-2)).toEqual([{ role: 'assistant', content: 'Draft with a made-up claim.' }, { role: 'user', content: 'check it' }]);

    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(reply('Draft.')).mockResolvedValueOnce(new Response('', { status: 500 })));
    expect((await callAskModel(config, [{ role: 'user', content: 'q' }], undefined, 'check it')).answer).toBe('Draft.');
  });
});
