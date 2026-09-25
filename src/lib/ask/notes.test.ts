import { describe, expect, it } from 'vitest';
import { parseNoteFile, sortNotes, validateNoteDraft } from './notes';

// Made-up text only: the real notes are restricted and never live in the repo.

describe('parseNoteFile', () => {
  it('titles the note from its first "# " heading and drops that line from the body', () => {
    const note = parseNoteFile('whatever.md', 'Intro line\n# Porch Visits\n\nStep one.\n## Sub heading\nStep two.\n');
    expect(note).toEqual({ title: 'Porch Visits', body: 'Intro line\n\nStep one.\n## Sub heading\nStep two.' });
  });

  it('ignores "##" headings and "#tags" when looking for the title', () => {
    const note = parseNoteFile('gate-codes.txt', '## Not the title\n#nospace\nBody text');
    expect(note.title).toBe('gate codes');
    expect(note.body).toBe('## Not the title\n#nospace\nBody text');
  });

  it('falls back to the file name, extension dropped, dashes and underscores as spaces', () => {
    expect(parseNoteFile('folder/Blue_widget--setup.md', 'Text').title).toBe('Blue widget setup');
    expect(parseNoteFile('.md', 'Text').title).toBe('Untitled note');
  });

  it('normalises Windows line endings and a byte-order mark', () => {
    const note = parseNoteFile('a.md', '\uFEFF# Title\r\nLine one\r\nLine two\r\n');
    expect(note).toEqual({ title: 'Title', body: 'Line one\nLine two' });
  });

  it('leaves an empty body when the file is only a heading, which the save then refuses', () => {
    const note = parseNoteFile('a.md', '# Only a title\n');
    expect(note.body).toBe('');
    expect(validateNoteDraft(note)).toEqual({ ok: false, error: '"Only a title" is empty' });
  });
});

describe('validateNoteDraft', () => {
  it('trims and accepts a titled note', () => {
    expect(validateNoteDraft({ title: '  Doors  ', body: ' Knock twice. ' })).toEqual({
      ok: true,
      note: { title: 'Doors', body: 'Knock twice.' },
    });
  });

  it('refuses a missing title, a non-string body and an oversized body', () => {
    expect(validateNoteDraft({ title: '', body: 'x' }).ok).toBe(false);
    expect(validateNoteDraft({ title: 'T', body: 42 }).ok).toBe(false);
    expect(validateNoteDraft({ title: 'T', body: 'x'.repeat(100_001) }).ok).toBe(false);
    expect(validateNoteDraft(null).ok).toBe(false);
  });
});

describe('sortNotes', () => {
  it('orders by order, then title, then id, so the prompt prefix never shifts', () => {
    const notes = [
      { id: 'b', title: 'Zeta', order: 1 },
      { id: 'a', title: 'Alpha', order: 2 },
      { id: 'c', title: 'Alpha', order: 1 },
      { id: 'd', title: 'Alpha', order: 1 },
    ];
    expect(sortNotes(notes).map((n) => n.id)).toEqual(['c', 'd', 'b', 'a']);
    expect(sortNotes([...notes].reverse()).map((n) => n.id)).toEqual(['c', 'd', 'b', 'a']);
  });
});
