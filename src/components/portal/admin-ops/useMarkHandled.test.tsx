// @vitest-environment jsdom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const refresh = vi.fn();
vi.mock('@/components/portal/admin-d/opsQueues', () => ({ useOpsQueues: () => ({ refresh }) }));
vi.mock('@/lib/firebase/config', () => ({ auth: { currentUser: { getIdToken: async () => 'token' } } }));

import { useMarkHandled } from './useMarkHandled';

const fetchMock = vi.fn();
const onHandled = vi.fn();
// The probe hands the hook's function out through a ref-like box, so the
// render body never reassigns a module variable.
const probe: { mark: ((id: string) => Promise<void>) | null } = { mark: null };
function Probe() {
  const mark = useMarkHandled('/api/portal/forms/fiber-report/review', onHandled);
  useEffect(() => {
    probe.mark = mark;
  });
  return null;
}

let root: Root;
beforeEach(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset();
  onHandled.mockClear();
  refresh.mockClear();
  root = createRoot(document.createElement('div'));
  await act(async () => root.render(<Probe />));
});

afterEach(() => {
  act(() => root.unmount());
  vi.unstubAllGlobals();
});

describe('useMarkHandled', () => {
  it('flips the row and reloads the Requests counts on success', async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await probe.mark!('a');
    expect(onHandled).toHaveBeenCalledWith('a');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('treats "already handled" (409) as done instead of an error', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409 });
    await expect(probe.mark!('a')).resolves.toBeUndefined();
    expect(onHandled).toHaveBeenCalledWith('a');
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('rejects on a real failure and leaves the row alone', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(probe.mark!('a')).rejects.toThrow();
    expect(onHandled).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});
