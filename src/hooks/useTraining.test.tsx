// @vitest-environment jsdom
//
// Training progress over the published modules only, and a module that is
// gone (404) told apart from one that failed to load.
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TrainingResource } from '@/types';

vi.mock('@/lib/firebase/getIdToken', () => ({ getIdToken: vi.fn(async () => 'token') }));

import { trainingProgress, useTraining } from './useTraining';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mod = (id: string, isRequired: boolean) => ({ id, isRequired }) as TrainingResource;
const done = { completed: true, progress: 100, lastAccessedAt: new Date() };

describe('trainingProgress', () => {
  it("doesn't count a completed module that is no longer published", () => {
    // A was completed, then unpublished: only required B is published, still open.
    const result = trainingProgress([mod('B', true)], { A: done });
    expect(result.completed).toBe(0);
    expect(result.total).toBe(1);
    expect(result.requiredLeft.map((r) => r.id)).toEqual(['B']);
  });

  it('counts completions of published modules', () => {
    const result = trainingProgress([mod('A', false), mod('B', true)], { A: done, B: done });
    expect(result).toMatchObject({ completed: 2, total: 2, requiredLeft: [] });
  });
});

describe('useTraining fetchResource', () => {
  let container: HTMLDivElement;
  let root: Root;
  const latest: { current: { missing: boolean; error: string | null; fetchResource: (id: string) => Promise<unknown> } | null } = { current: null };

  function Harness() {
    const training = useTraining();
    useEffect(() => {
      latest.current = training;
    });
    return null;
  }

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  async function load(response: Response) {
    vi.stubGlobal('fetch', vi.fn(async () => response));
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await latest.current!.fetchResource('gone');
    });
    return latest.current!;
  }

  it('marks a deleted or unpublished module as missing, not a load error', async () => {
    const training = await load(new Response(JSON.stringify({ error: 'Resource not found' }), { status: 404 }));
    expect(training.missing).toBe(true);
    expect(training.error).toBeNull();
  });

  it('keeps other failures as a retryable error', async () => {
    const training = await load(new Response(JSON.stringify({ error: 'Boom' }), { status: 500 }));
    expect(training.missing).toBe(false);
    expect(training.error).toBe('Boom');
  });
});

describe('useTraining fetchResources (pull to refresh)', () => {
  let container: HTMLDivElement;
  let root: Root;
  type Api = ReturnType<typeof useTraining>;
  const latest: { current: Api | null } = { current: null };

  function Harness() {
    const training = useTraining();
    useEffect(() => {
      latest.current = training;
    });
    return null;
  }

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.unstubAllGlobals();
  });

  it('keeps the list on a failed quiet refetch and reports when it was loaded', async () => {
    const list = [mod('A', false), mod('B', true)];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ resources: list }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    await act(async () => root.render(<Harness />));
    await act(async () => {
      await latest.current!.fetchResources();
    });
    expect(latest.current!.staleAt).toBeNull();

    let loadingDuring = false;
    await act(async () => {
      const run = latest.current!.fetchResources(undefined, { quiet: true });
      loadingDuring = latest.current!.loading;
      await run;
    });
    expect(loadingDuring).toBe(false);
    expect(latest.current!.resources.map((r) => r.id)).toEqual(['A', 'B']);
    expect(latest.current!.error).toBeNull();
    expect(latest.current!.loading).toBe(false);
    expect(typeof latest.current!.staleAt).toBe('number');
  });
});
