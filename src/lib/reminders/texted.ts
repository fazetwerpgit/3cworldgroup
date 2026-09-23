// Which install reminders this rep has already texted from this phone, so the
// Home row can read "Texted". A convenience only: it lives in localStorage
// (keys from installEve.textedKey, `saleId:YYYY-MM-DD`, so a reschedule is a
// new row), and every read and write may fail quietly.

const TEXTED_KEY = 'portal-install-texted';
const CHANGE_EVENT = 'portal-install-texted-change';
/** Keeps the list short; a reminder only matters for a day. */
const KEEP = 50;

export function readTextedRaw(): string | null {
  try {
    return window.localStorage.getItem(TEXTED_KEY);
  } catch {
    return null;
  }
}

export function parseTexted(raw: string | null): string[] {
  try {
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(value) ? value.filter((key): key is string => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

export function markTexted(key: string) {
  try {
    const keys = parseTexted(readTextedRaw()).filter((existing) => existing !== key);
    window.localStorage.setItem(TEXTED_KEY, JSON.stringify([...keys, key].slice(-KEEP)));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage blocked: the row just keeps offering "Text".
  }
}

export function subscribeTexted(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}
