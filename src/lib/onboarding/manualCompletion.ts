// An owner can mark any onboarding item complete for a rep (a document signed
// on paper, a license checked in person). The note is the only record of why,
// so it is required and kept short enough to read at a glance.

export const MANUAL_NOTE_MIN = 3;
export const MANUAL_NOTE_MAX = 300;

/** Stored on userOnboarding/{uid}_{itemId} next to the usual review stamps. */
export interface ManualCompletion {
  note: string;
  /** Owner uid, from the verified token. */
  by: string;
  byName: string;
  at: Date;
}

/** Trimmed note when it is a string of an allowed length, otherwise null. */
export function normalizeManualNote(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const note = value.trim();
  return note.length >= MANUAL_NOTE_MIN && note.length <= MANUAL_NOTE_MAX ? note : null;
}
