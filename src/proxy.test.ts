import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { config, proxy } from './proxy';

function req(path: string, method: string, headers: Record<string, string> = {}) {
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

describe('proxy: view as rep is read only', () => {
  it('refuses every write carrying x-view-as with 403 "Read-only view"', async () => {
    for (const [path, method] of [
      ['/api/portal/sales', 'POST'],
      ['/api/portal/sales/s1', 'PUT'],
      ['/api/portal/sales/s1', 'DELETE'],
      ['/api/portal/sales/s1/install-date', 'PATCH'],
      ['/api/portal/chat/messages', 'POST'],
    ] as const) {
      const res = proxy(req(path, method, { 'x-view-as': 'rep-noah' }));
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(await res.json()).toEqual({ error: 'Read-only view' });
    }
  });

  it('lets reads with the header through to the route (which checks the owner)', () => {
    const res = proxy(req('/api/portal/sales', 'GET', { 'x-view-as': 'rep-noah' }));
    expect(res.status).toBe(200);
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('leaves ordinary writes alone', () => {
    const res = proxy(req('/api/portal/sales', 'POST'));
    expect(res.headers.get('x-middleware-next')).toBe('1');
  });

  it('runs on every portal API route', () => {
    expect(config.matcher).toBe('/api/portal/:path*');
  });
});
