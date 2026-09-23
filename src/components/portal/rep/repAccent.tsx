'use client';

// TEMP accent picker — remove after Jacob picks
// How much brand lime the rep shell carries: 1 Light (default), 2 Medium,
// 3 Strong. `?accent=1|2|3` on any portal URL sets it and remembers it in
// localStorage; the rules live in rep.module.css under "Accent levels".

import { useEffect, useSyncExternalStore } from 'react';
import s from './rep.module.css';

export type RepAccent = '1' | '2' | '3';

const LEVELS: RepAccent[] = ['1', '2', '3'];
const KEY = 'portal-accent';
const EVENT = 'portal-accent-change';

const isLevel = (v: string | null): v is RepAccent => v === '1' || v === '2' || v === '3';

function paramAccent(): RepAccent | null {
  const v = new URLSearchParams(window.location.search).get('accent');
  return isLevel(v) ? v : null;
}

function storedAccent(): RepAccent | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isLevel(v) ? v : null;
  } catch {
    return null;
  }
}

function store(level: RepAccent) {
  try {
    window.localStorage.setItem(KEY, level);
  } catch {
    // Private mode or blocked storage: the level holds for this page only.
  }
}

const getSnapshot = (): RepAccent => paramAccent() ?? storedAccent() ?? '1';
const getServerSnapshot = (): RepAccent => '1';

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  window.addEventListener('storage', onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener('storage', onChange);
    window.removeEventListener('popstate', onChange);
  };
}

/** The current accent level, from `?accent=`, then localStorage, else 1. */
export function useRepAccent(): RepAccent {
  const level = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  // A level passed in the URL sticks for the pages that follow without it.
  useEffect(() => {
    const fromUrl = paramAccent();
    if (fromUrl) store(fromUrl);
  }, [level]);
  return level;
}

function pick(level: RepAccent) {
  store(level);
  const url = new URL(window.location.href);
  if (url.searchParams.has('accent')) {
    url.searchParams.set('accent', level);
    window.history.replaceState(window.history.state, '', url);
  }
  window.dispatchEvent(new Event(EVENT));
}

/** Dev-only "Accent 1 2 3" pill over the tab bar. Render inside a BodyLayer. */
export function AccentPicker() {
  const level = useRepAccent();
  return (
    <div className={s.accentPicker} role="group" aria-label="Accent level">
      <span aria-hidden="true">Accent</span>
      {LEVELS.map((l) => (
        <button key={l} type="button" aria-pressed={level === l} onClick={() => pick(l)}>
          {l}
        </button>
      ))}
    </div>
  );
}
