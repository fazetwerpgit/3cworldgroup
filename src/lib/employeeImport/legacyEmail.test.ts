import { describe, expect, it } from 'vitest';
import { buildExportRows } from './exportSheet';
import { buildImportPlan, emailMatchesToConfirm, matchUsers, toPersonView } from './plan';
import type { SheetRow } from './parseSheet';

function sheetRow(name: string, email: string): SheetRow {
  return { name, email, phone: '', address: '', shirtSize: '', ssn: '', dlNumber: '' };
}

describe('legacy capital-E Email user docs', () => {
  it('export fills the Email column from the legacy field', () => {
    const { rows } = buildExportRows(
      [
        { uid: 'a', data: { displayName: 'Alex Legacy', Email: ' Alex@Example.com ' } },
        { uid: 'b', data: { displayName: 'Bea Modern', email: 'bea@example.com' } },
      ],
      new Map()
    );
    expect(rows.map((r) => r.email)).toEqual(['Alex@Example.com', 'bea@example.com']);
  });

  it('import matches a legacy-Email user by email instead of an ambiguous name', () => {
    const rows = [sheetRow('Sam Smith', 'sam.one@example.com'), sheetRow('Sam Smith', 'sam.two@example.com')];
    const result = matchUsers(
      [
        { uid: 'u1', data: { displayName: 'Sam Smith', Email: 'Sam.One@example.com' } },
        { uid: 'u2', data: { displayName: 'Sam Smith', email: 'sam.two@example.com' } },
      ],
      rows
    );
    expect(result.skipped).toEqual([]);
    expect(result.pairs.map((p) => [p.user.uid, p.row.email])).toEqual([
      ['u1', 'sam.one@example.com'],
      ['u2', 'sam.two@example.com'],
    ]);
  });
});

describe('email matches to confirm', () => {
  it('marks email vs name matches and lists only email matches that would write', () => {
    const rows = [
      { ...sheetRow('Sam Sheet', 'sam@example.com'), phone: '3195550101' },
      { ...sheetRow('Pat Name', ''), phone: '3195550102' },
    ];
    const match = matchUsers(
      [
        { uid: 'u1', data: { displayName: 'Sam Portal', Email: 'SAM@example.com' } },
        { uid: 'u2', data: { displayName: 'Pat Name' } },
      ],
      rows
    );
    expect(match.pairs.map((p) => [p.user.uid, p.matchedBy])).toEqual([
      ['u1', 'email'],
      ['u2', 'name'],
    ]);
    const plan = buildImportPlan(match, new Map());
    const sam = plan.people.find((person) => person.uid === 'u1');
    expect(sam && toPersonView(sam)).toMatchObject({ matchedBy: 'email', matchEmail: 'sam@example.com', sheetName: 'Sam Sheet' });
    expect(emailMatchesToConfirm(plan.people)).toEqual(['sam@example.com']);
  });
});
