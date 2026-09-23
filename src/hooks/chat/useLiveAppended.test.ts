import { describe, expect, it } from 'vitest';
import { initialLiveAppend, nextLiveAppend } from './useLiveAppended';

const step = (ids: string[], ready = true, key = 'c1', from = initialLiveAppend('c1')) =>
  nextLiveAppend(from, ids, ready, key);

describe('nextLiveAppend', () => {
  it('treats the first loaded list as history', () => {
    const state = step(['a', 'b', 'c']);
    expect([...state.fresh]).toEqual([]);
    expect(step(['a', 'b', 'c'], true, 'c1', state)).toBe(state);
  });

  it('waits for the load: nothing counts while loading', () => {
    const loading = step([], false);
    expect(loading.known).toBeNull();
    const loaded = step(['a', 'b'], true, 'c1', loading);
    expect([...loaded.fresh]).toEqual([]);
  });

  it('marks a message appended at the bottom as live', () => {
    const loaded = step(['a', 'b']);
    const next = step(['a', 'b', 'c'], true, 'c1', loaded);
    expect([...next.fresh]).toEqual(['c']);
  });

  it('never marks older history paged in above', () => {
    const loaded = step(['c', 'd']);
    const next = step(['a', 'b', 'c', 'd'], true, 'c1', loaded);
    expect([...next.fresh]).toEqual([]);
  });

  it('lets a reconnect burst appear without animating', () => {
    const loaded = step(['a']);
    const next = step(['a', 'b', 'c', 'd', 'e'], true, 'c1', loaded);
    expect([...next.fresh]).toEqual([]);
  });

  it('starts over on another channel', () => {
    const loaded = step(['a']);
    const withLive = step(['a', 'b'], true, 'c1', loaded);
    const other = nextLiveAppend(withLive, ['x', 'y'], true, 'c2');
    expect([...other.fresh]).toEqual([]);
    expect(other.key).toBe('c2');
  });

  it('marks the first message in an empty channel as live', () => {
    const empty = step([]);
    const next = step(['a'], true, 'c1', empty);
    expect([...next.fresh]).toEqual(['a']);
  });
});
