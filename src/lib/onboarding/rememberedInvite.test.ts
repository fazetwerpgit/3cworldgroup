import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkSignupInvite } from './rememberedInvite';

const TOKEN = 'openTokenAbcdefghijklmnopqrstuvwxyz0123456';

function reply(status: number, body: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify(body), { status })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('checkSignupInvite', () => {
  it('returns the signup state of a good invite', async () => {
    reply(200, { ok: true, state: 'open' });
    await expect(checkSignupInvite(TOKEN)).resolves.toBe('open');
    reply(200, { ok: true, state: 'submitted' });
    await expect(checkSignupInvite(TOKEN)).resolves.toBe('submitted');
  });

  it('reports a definite turn-down as rejected', async () => {
    reply(200, { ok: false });
    await expect(checkSignupInvite(TOKEN)).resolves.toBe('rejected');
    reply(200, { ok: true, state: 'expired' });
    await expect(checkSignupInvite(TOKEN)).resolves.toBe('rejected');
  });

  it('throws on a server error instead of rejecting, so the remembered invite is kept', async () => {
    reply(503, { ok: false });
    await expect(checkSignupInvite(TOKEN)).rejects.toThrow();
    reply(500, { ok: false });
    await expect(checkSignupInvite(TOKEN)).rejects.toThrow();
  });

  it('throws when offline', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }));
    await expect(checkSignupInvite(TOKEN)).rejects.toThrow();
  });
});
