import { describe, expect, it } from 'vitest';
import { isAbortError } from './isAbortError';

describe('isAbortError', () => {
  it('recognizes Chrome route cancellation reported as TypeError', () => {
    const controller = new AbortController();

    expect(isAbortError(new TypeError('Failed to fetch'), controller.signal)).toBe(true);
  });

  it('recognizes standard AbortError exceptions', () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';

    expect(isAbortError(error)).toBe(true);
  });

  it('does not hide genuine errors', () => {
    expect(isAbortError(new TypeError('Network request failed'))).toBe(false);
  });
});
