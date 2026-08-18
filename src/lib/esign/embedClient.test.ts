// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('loadSignWellEmbed', () => {
  beforeEach(() => {
    vi.resetModules();
    document.head.innerHTML = '';
    delete (window as unknown as { SignWellEmbed?: unknown }).SignWellEmbed;
  });

  afterEach(() => {
    document.head.innerHTML = '';
    delete (window as unknown as { SignWellEmbed?: unknown }).SignWellEmbed;
  });

  it('resolves immediately when window.SignWellEmbed is pre-set', async () => {
    const fakeCtor = function () {} as unknown as new (opts: unknown) => unknown;
    (window as unknown as { SignWellEmbed?: unknown }).SignWellEmbed = fakeCtor;

    const { loadSignWellEmbed } = await import('./embedClient');
    const result = await loadSignWellEmbed();

    expect(result).toBe(fakeCtor);
    // No script should have been appended since the global was already present.
    expect(document.head.querySelectorAll('script').length).toBe(0);
  });

  it('rejects when the appended script fires its error event', async () => {
    const { loadSignWellEmbed } = await import('./embedClient');

    const pending = loadSignWellEmbed();
    const script = document.head.querySelector('script');
    expect(script).not.toBeNull();

    script!.dispatchEvent(new Event('error'));

    await expect(pending).rejects.toThrow();
  });

  it('retries by appending a fresh script element after a prior failure', async () => {
    const { loadSignWellEmbed } = await import('./embedClient');

    const firstPending = loadSignWellEmbed();
    const firstScript = document.head.querySelector('script');
    expect(firstScript).not.toBeNull();
    firstScript!.dispatchEvent(new Event('error'));
    await expect(firstPending).rejects.toThrow();

    const secondPending = loadSignWellEmbed();
    const scriptsAfterRetry = document.head.querySelectorAll('script');
    // The failed script is still in the DOM; a fresh one is appended for the retry.
    expect(scriptsAfterRetry.length).toBe(2);
    const secondScript = scriptsAfterRetry[scriptsAfterRetry.length - 1];
    expect(secondScript).not.toBe(firstScript);

    const fakeCtor = function () {} as unknown as new (opts: unknown) => unknown;
    (window as unknown as { SignWellEmbed?: unknown }).SignWellEmbed = fakeCtor;
    secondScript.dispatchEvent(new Event('load'));

    await expect(secondPending).resolves.toBe(fakeCtor);
  });
});
