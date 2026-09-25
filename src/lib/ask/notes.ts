// Ask 3C's knowledge notes: the owner's own text, the only thing the helper
// answers from. Stored server-side only in knowledgeNotes/{id} (no client
// rules), entered through the owner's Knowledge tab. Shared by the owner page
// (upload parsing, size estimate) and the routes (validation, prompt order).

export const KNOWLEDGE_NOTES = 'knowledgeNotes';

export const MAX_NOTE_TITLE = 200;
/** One note's body. The whole set goes into every prompt, so keep notes lean. */
export const MAX_NOTE_BODY = 100_000;
/** Files the upload accepts (read in the browser as text). */
export const NOTE_FILE_ACCEPT = '.md,.markdown,.txt,text/markdown,text/plain';
export const MAX_NOTE_FILE_BYTES = 400 * 1024;

export interface KnowledgeNote {
  id: string;
  title: string;
  body: string;
  order: number;
  updatedAt: string | null;
  updatedBy: string;
}

export interface NoteDraft {
  title: string;
  body: string;
}

/**
 * Prompt order: by `order`, then title, then id. Stable across requests, so the
 * notes block (the prompt's long prefix) is byte-identical and DeepSeek's
 * automatic prefix cache can hit.
 */
export function sortNotes<T extends { id: string; title: string; order: number }>(notes: T[]): T[] {
  return [...notes].sort(
    (a, b) => a.order - b.order || a.title.localeCompare(b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

/** A rough token count (about 4 characters a token for English text). */
export function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

/** A trimmed, length-checked title and body, or an error for the owner. */
export function validateNoteDraft(input: unknown): { ok: true; note: NoteDraft } | { ok: false; error: string } {
  const raw = (input ?? {}) as { title?: unknown; body?: unknown };
  const title = typeof raw.title === 'string' ? raw.title.trim() : '';
  const body = typeof raw.body === 'string' ? raw.body.replace(/\r\n?/g, '\n').trim() : '';
  if (!title) return { ok: false, error: 'Give the note a title' };
  if (title.length > MAX_NOTE_TITLE) return { ok: false, error: `Keep the title under ${MAX_NOTE_TITLE} characters` };
  if (!body) return { ok: false, error: `"${title}" is empty` };
  if (body.length > MAX_NOTE_BODY) {
    return { ok: false, error: `"${title}" is too long. Split it into notes under ${MAX_NOTE_BODY.toLocaleString('en-US')} characters` };
  }
  return { ok: true, note: { title, body } };
}

/**
 * One uploaded .md/.txt file as a note: titled by its first "# " heading (that
 * line is then dropped from the body), else by the file name without its
 * extension, dashes and underscores read as spaces.
 */
export function parseNoteFile(fileName: string, text: string): NoteDraft {
  const body = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const lines = body.split('\n');
  const headingAt = lines.findIndex((line) => /^#\s+\S/.test(line));
  if (headingAt >= 0) {
    const title = lines[headingAt].replace(/^#\s+/, '').replace(/\s+#*\s*$/, '').trim();
    const rest = [...lines.slice(0, headingAt), ...lines.slice(headingAt + 1)].join('\n').trim();
    return { title: title.slice(0, MAX_NOTE_TITLE), body: rest };
  }
  const base = fileName.replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
  const title = base.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Untitled note';
  return { title: title.slice(0, MAX_NOTE_TITLE), body: body.trim() };
}
