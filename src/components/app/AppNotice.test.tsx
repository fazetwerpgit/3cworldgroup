// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetBridgeForTests, parseNativeMessage, receiveNativeMessage } from '@/lib/app/bridge';
import AppNotice from './AppNotice';
import { NOTICE_HIDE_MS, nextNotice } from './appNotice';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const notice = (id: string, kind: string, message = '') => ({ source: '3c-shell', type: 'notice', id, kind, message });

describe('notice messages', () => {
  it('parses valid notices and drops malformed ones', () => {
    expect(parseNativeMessage(notice('d1', 'progress', 'Preparing download…'))).toEqual(notice('d1', 'progress', 'Preparing download…'));
    expect(parseNativeMessage(notice('d1', 'dismiss'))).toEqual(notice('d1', 'dismiss'));
    expect(parseNativeMessage(notice('d1', 'shout', 'x'))).toBeNull();
    expect(parseNativeMessage(notice('', 'error', 'x'))).toBeNull();
    expect(parseNativeMessage(notice('d1', 'error'))).toBeNull();
    expect(parseNativeMessage({ ...notice('d1', 'error', 'x'), source: 'page' })).toBeNull();
  });

  it('nextNotice replaces by event and dismisses only its own id', () => {
    const shown = nextNotice(null, notice('a', 'progress', 'p') as never);
    expect(shown).toEqual({ id: 'a', kind: 'progress', message: 'p' });
    expect(nextNotice(shown, notice('b', 'dismiss') as never)).toBe(shown);
    expect(nextNotice(shown, notice('a', 'dismiss') as never)).toBeNull();
    expect(nextNotice(shown, notice('a', 'error', 'bad') as never)).toEqual({ id: 'a', kind: 'error', message: 'bad' });
  });
});

describe('<AppNotice>', () => {
  let root: Root;
  let container: HTMLDivElement;
  const send = (m: unknown) => act(() => receiveNativeMessage(m));
  const toast = () => document.body.querySelector('[role="status"], [role="alert"]');

  beforeEach(() => {
    __resetBridgeForTests();
    vi.useFakeTimers();
    container = document.createElement('div');
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    vi.useRealTimers();
    delete window.__3C_APP__;
    __resetBridgeForTests();
  });

  it('in the app: shows preparing, then the result, which hides by itself', () => {
    window.__3C_APP__ = true;
    act(() => root.render(<AppNotice />));
    send(notice('d1', 'progress', 'Preparing download…'));
    expect(toast()?.textContent).toBe('Preparing download…');
    expect(toast()?.getAttribute('role')).toBe('status');
    send(notice('d1', 'error', 'That file is no longer available.'));
    expect(toast()?.textContent).toBe('That file is no longer available.');
    expect(toast()?.getAttribute('role')).toBe('alert');
    act(() => vi.advanceTimersByTime(NOTICE_HIDE_MS.error!));
    expect(toast()).toBeNull();
  });

  it('progress stays until replaced or dismissed', () => {
    window.__3C_APP__ = true;
    act(() => root.render(<AppNotice />));
    send(notice('d1', 'progress', 'Preparing download…'));
    act(() => vi.advanceTimersByTime(60_000));
    expect(toast()).not.toBeNull();
    send(notice('d1', 'dismiss'));
    expect(toast()).toBeNull();
  });

  it('on the web: shows nothing', () => {
    act(() => root.render(<AppNotice />));
    send(notice('d1', 'progress', 'Preparing download…'));
    expect(toast()).toBeNull();
  });
});
