// @vitest-environment jsdom
//
// Owner home: one summary request on load (one sales-book read on the server),
// a section the server lists as failed shows 'error', and Retry asks for that
// section alone.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'tok') }));

import { useOwnerDashboard } from './useOwnerDashboard';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const latest: { current: ReturnType<typeof useOwnerDashboard> | null } = { current: null };

function Harness() {
  const state = useOwnerDashboard();
  useEffect(() => {
    latest.current = state;
  });
  return null;
}

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body });
const fetchMock = vi.fn();
const flush = () => act(async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
});

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  vi.spyOn(console, 'error').mockImplementation(() => {});
  container = document.createElement('div');
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useOwnerDashboard', () => {
  it('loads all sections in one request and marks a failed section as error', async () => {
    fetchMock.mockResolvedValueOnce(json({ generatedAt: 'x', problems: [], recruiting: { a: 1 }, failed: ['money'] }));
    act(() => root.render(<Harness />));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe('/api/portal/owner/summary');
    expect(latest.current!.money.status).toBe('error');
    expect(latest.current!.problems).toEqual({ status: 'ready', data: [] });
    expect(latest.current!.recruiting).toEqual({ status: 'ready', data: { a: 1 } });

    fetchMock.mockResolvedValueOnce(json({ generatedAt: 'y', money: { m: 1 } }));
    act(() => latest.current!.retry('money'));
    await flush();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe('/api/portal/owner/summary?section=money');
    expect(latest.current!.money).toEqual({ status: 'ready', data: { m: 1 } });
    expect(latest.current!.problems).toEqual({ status: 'ready', data: [] });
  });

  it('marks every section as error when the request fails, never zeros', async () => {
    fetchMock.mockResolvedValueOnce(json({ error: 'nope' }, 500));
    act(() => root.render(<Harness />));
    await flush();

    expect(latest.current!.money.status).toBe('error');
    expect(latest.current!.problems.status).toBe('error');
    expect(latest.current!.recruiting.status).toBe('error');
  });
});
