import { describe, expect, it } from 'vitest';
import { previewLines, rowsSentence } from './LeadListUpload';

describe('rowsSentence', () => {
  it('says where every row went', () => {
    expect(
      rowsSentence({
        rows: 3486,
        rowsBreakdown: { houseRows: 596, apartmentRows: 2880, buildings: 134 },
        skipped: [{ reason: 'repeated-row', count: 10 }],
      })
    ).toBe('3,486 rows: 596 houses, 2,880 apartments in 134 buildings, 10 listed twice.');
  });

  it('names every left-out reason in plain words and leaves out empty parts', () => {
    expect(
      rowsSentence({
        rows: 11,
        rowsBreakdown: { houseRows: 1, apartmentRows: 0, buildings: 0 },
        skipped: [
          { reason: 'not-door-knock-allowed', count: 5 },
          { reason: 'no-coordinates', count: 3 },
          { reason: 'no-pack', count: 1 },
          { reason: 'repeated-row', count: 1 },
        ],
      })
    ).toBe('11 rows: 1 house, 5 not allowed to knock, 3 without a map location, 1 without a pack, 1 listed twice.');
  });
});

describe('previewLines', () => {
  const base = {
    format: 'sr' as const,
    assignee: null,
    fromFile: true,
    rows: 7,
    rowsBreakdown: { houseRows: 5, apartmentRows: 0, buildings: 0 },
    doors: 5,
    skipped: [{ reason: 'not-located' as const, count: 2 }],
    duplicates: 0,
    mdus: 0,
    units: 0,
    addressPending: 3,
    geocoded: 2,
    approximate: 1,
    notLocated: 2,
    statuses: [
      { name: 'Go Back', dispositionId: 'go_back', count: 1 },
      { name: 'Not Home 3', dispositionId: 'not_home', count: 1 },
    ],
    unmatchedStatuses: [{ name: 'Knock', count: 1 }],
    assignees: [{ email: 'rep1@example.test', uid: 'rep-1', name: 'Rep One', count: 3 }],
    unmatchedAssignees: [{ email: 'stranger@example.test', count: 1 }],
    fileAssignees: 2,
    appointments: { kept: 1, ignored: 1 },
    contacts: 2,
    notes: 1,
  };

  it('explains locating, statuses, people from the file, appointments, contacts and missing addresses', () => {
    expect(previewLines(base)).toEqual([
      "7 rows: 5 houses, 2 couldn't be located.",
      '2 rows were placed on the map from the address, 1 of them approximately located.',
      "2 couldn't be located. Only US addresses can be looked up; others need Latitude and Longitude columns.",
      "2 rows have a status that comes in as the door's result: Go Back (1), Not Home 3 (1).",
      '1 row has a status that matches no result in this campaign, so those doors come in not knocked: Knock (1).',
      'Goes to the people the file names: Rep One (3).',
      '1 row names someone not in the portal, so nobody gets those doors yet: stranger@example.test (1).',
      '1 appointment kept.',
      "1 appointment left out: the status takes no appointment, or the date couldn't be read.",
      '2 with contact details, 1 with notes.',
      '3 doors have no street address yet. Each fills in the first time someone opens that door in the app.',
    ]);
  });

  it('shows only the rows sentence for a plain file, and says when the file names nobody', () => {
    const plain = {
      ...base,
      fromFile: false,
      skipped: [],
      rows: 5,
      addressPending: 0,
      geocoded: 0,
      approximate: 0,
      notLocated: 0,
      statuses: [],
      unmatchedStatuses: [],
      assignees: [],
      unmatchedAssignees: [],
      fileAssignees: 0,
      appointments: { kept: 0, ignored: 0 },
      contacts: 0,
      notes: 0,
    };
    expect(previewLines(plain)).toEqual(['5 rows: 5 houses.']);
    expect(previewLines({ ...plain, fromFile: true })).toEqual([
      '5 rows: 5 houses.',
      "This file doesn't say who gets each door, so nobody gets them yet.",
    ]);
  });
});
