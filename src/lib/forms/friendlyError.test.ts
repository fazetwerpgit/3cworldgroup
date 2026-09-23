import { describe, expect, it } from 'vitest';
import { friendlyError } from './friendlyError';

describe('friendlyError', () => {
  it.each([
    'Failed to fetch',
    'Load failed',
    'NetworkError when attempting to fetch resource.',
    'Firebase: Error (auth/network-request-failed).',
    'The network connection was lost.',
    'The Internet connection appears to be offline.',
  ])('reads %s as no signal', (raw) => {
    expect(friendlyError(raw)).toEqual({
      offline: true,
      message: 'No signal. Check your connection and send again.',
    });
  });

  it.each([
    'The string did not match the expected pattern.',
    `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
    'JSON.parse: unexpected character at line 1 column 1 of the JSON data',
    'Unexpected end of JSON input',
  ])('reads a non-JSON server reply (%s) as a server hiccup', (raw) => {
    expect(friendlyError(raw)).toEqual({ offline: false, message: 'Server hiccup, try again.' });
  });

  it('keeps a real server message', () => {
    expect(friendlyError('Choose a market.')).toEqual({ offline: false, message: 'Choose a market.' });
  });

  it('uses the given verb for the retry', () => {
    expect(friendlyError('Load failed', 'sign').message).toBe('No signal. Check your connection and sign again.');
  });

  it('keeps the upload timeout short, for the tile\'s Retry', () => {
    expect(friendlyError('Upload timed out', 'upload')).toEqual({ offline: true, message: 'Upload timed out' });
  });
});
