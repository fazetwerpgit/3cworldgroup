import { describe, expect, it, vi } from 'vitest';
import { installAnnouncementFetchMock, mockAnnouncementJson } from './fetchMock';

function makeHost() {
  const real = vi.fn(async () => new Response('real', { status: 200 }));
  const host = { fetch: real as unknown as typeof fetch };
  return { host, real };
}

describe('design-lab announce fetch mock', () => {
  it('mocks only announcements API URLs', () => {
    expect(mockAnnouncementJson('/api/portal/announcements')).toMatchObject({ nextSendDate: '2026-09-24' });
    expect(mockAnnouncementJson('/api/portal/announcements/recipients')).toEqual({ count: 47 });
    expect(mockAnnouncementJson('/api/portal/announcements/send-now')).toMatchObject({ sentCount: 46 });
    expect(mockAnnouncementJson('/api/portal/announcements/test')).toEqual({ devices: 2, delivered: 2 });
    expect(mockAnnouncementJson('/api/portal/announcements/1/cancel')).toEqual({ ok: true });
    expect(mockAnnouncementJson('/api/portal/me')).toBeNull();
    expect(mockAnnouncementJson('https://identitytoolkit.googleapis.com/v1/accounts:lookup')).toBeNull();
    expect(mockAnnouncementJson('/portal?_rsc=abc')).toBeNull();
    expect(mockAnnouncementJson('/api/portal/announcementsx')).toBeNull();
  });

  it('passes non-announcement requests through to the real fetch', async () => {
    const { host, real } = makeHost();
    const restore = installAnnouncementFetchMock(host);
    const res = await host.fetch('/portal?_rsc=abc', { method: 'GET' });
    expect(await res.text()).toBe('real');
    expect(real).toHaveBeenCalledWith('/portal?_rsc=abc', { method: 'GET' });
    const mocked = await host.fetch('/api/portal/announcements/recipients');
    expect(await mocked.json()).toEqual({ count: 47 });
    expect(real).toHaveBeenCalledTimes(1);
    restore();
  });

  it('restores the original fetch on cleanup', () => {
    const { host, real } = makeHost();
    const restore = installAnnouncementFetchMock(host);
    expect(host.fetch).not.toBe(real);
    restore();
    expect(host.fetch).toBe(real);
  });

  it('does not clobber a fetch installed after the mock', () => {
    const { host } = makeHost();
    const restore = installAnnouncementFetchMock(host);
    const later = vi.fn() as unknown as typeof fetch;
    host.fetch = later;
    restore();
    expect(host.fetch).toBe(later);
  });
});
