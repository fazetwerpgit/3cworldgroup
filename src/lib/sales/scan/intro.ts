// The one-time Home card that tells reps about the screenshot reader. It shows
// from the launch day (NEXT_PUBLIC_SALE_SCAN_LAUNCH, YYYY-MM-DD) for 14 days,
// until the rep dismisses it or has one screenshot read. That state lives in
// localStorage: a convenience only, so every read and write may fail quietly.

export const SCAN_INTRO_KEY = 'portal-scan-intro';
export const SCAN_INTRO_DAYS = 14;
const CHANGE_EVENT = 'portal-scan-intro-change';

export type ScanIntroState = { dismissed?: boolean; used?: boolean };

export function readScanIntroRaw(): string | null {
  try {
    return window.localStorage.getItem(SCAN_INTRO_KEY);
  } catch {
    return null;
  }
}

export function parseScanIntro(raw: string | null): ScanIntroState {
  try {
    const value = raw ? (JSON.parse(raw) as unknown) : null;
    if (!value || typeof value !== 'object') return {};
    const state = value as Record<string, unknown>;
    return { dismissed: state.dismissed === true, used: state.used === true };
  } catch {
    return {};
  }
}

function writeScanIntro(patch: ScanIntroState) {
  try {
    const next = { ...parseScanIntro(readScanIntroRaw()), ...patch };
    window.localStorage.setItem(SCAN_INTRO_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(CHANGE_EVENT));
  } catch {
    // Storage blocked: the card simply comes back next visit.
  }
}

export const dismissScanIntro = () => writeScanIntro({ dismissed: true });
/** A screenshot was read and filled the form: the rep has found the feature. */
export const markScanIntroUsed = () => writeScanIntro({ used: true });

export function subscribeScanIntro(onChange: () => void) {
  window.addEventListener('storage', onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener('storage', onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Local midnight of a YYYY-MM-DD launch day, or null when unset or malformed. */
export function scanLaunchStart(value: string | undefined): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value?.trim() ?? '');
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.getMonth() === Number(match[2]) - 1 ? date : null;
}

/** Whether the Home card shows, all rules in one place. */
export function shouldShowScanIntro(input: {
  enabled: boolean;
  launch: string | undefined;
  now: Date;
  state: ScanIntroState;
}): boolean {
  const start = scanLaunchStart(input.launch);
  if (!input.enabled || !start || input.state.dismissed || input.state.used) return false;
  const end = new Date(start);
  end.setDate(end.getDate() + SCAN_INTRO_DAYS);
  return input.now >= start && input.now < end;
}
