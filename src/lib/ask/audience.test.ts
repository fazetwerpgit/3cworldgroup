import { describe, expect, it } from 'vitest';
import { MANAGEMENT_FIELD_ROLES, SOLAR_ROLES, type FieldRole, type SolarRole } from '@/types/auth';
import {
  askLineFor,
  audiencesFor,
  hasSolarNotes,
  normalizeAudience,
  notesForAudience,
  parseAudience,
  type AudienceUser,
  type NoteAudience,
} from './audience';

const tags = (user: AudienceUser) => [...audiencesFor(user)].sort();

describe('normalizeAudience', () => {
  it('reads missing and empty as everyone, so untagged notes behave as before', () => {
    expect(normalizeAudience(undefined)).toEqual(['all']);
    expect(normalizeAudience(null)).toEqual(['all']);
    expect(normalizeAudience([])).toEqual(['all']);
  });

  it('fails closed to owners when tags are there but none is known', () => {
    expect(normalizeAudience(['nobody'])).toEqual(['owner']);
    expect(normalizeAudience(['nobody', 'vip'])).toEqual(['owner']);
    expect(normalizeAudience('solar')).toEqual(['owner']);
    expect(normalizeAudience(['nobody', 'solar'])).toEqual(['solar']);
    expect(notesForAudience([{ id: 'x', title: 'X', order: 1, audience: ['typo'] }], { fieldRole: 'regional_manager', solarRole: 'sales_director' })).toEqual([]);
    expect(notesForAudience([{ id: 'x', title: 'X', order: 1, audience: ['typo'] }], { role: 'owner' }).map((n) => n.id)).toEqual(['x']);
  });

  it("collapses 'all' with others to everyone and orders the rest canonically", () => {
    expect(normalizeAudience(['solar', 'all'])).toEqual(['all']);
    expect(normalizeAudience(['owner', 'solar', 'solar', 'manager'])).toEqual(['solar', 'manager', 'owner']);
  });
});

describe('parseAudience', () => {
  it('passes through not-sent and refuses anything but known tags', () => {
    expect(parseAudience(undefined)).toEqual({ ok: true, audience: undefined });
    expect(parseAudience(['knock', 'solar'])).toEqual({ ok: true, audience: ['solar', 'knock'] });
    expect(parseAudience([]).ok).toBe(false);
    expect(parseAudience(['solar', 'vip']).ok).toBe(false);
    expect(parseAudience('solar').ok).toBe(false);
    expect(parseAudience(null).ok).toBe(false);
  });
});

describe('audiencesFor', () => {
  it('a fiber rep: everyone and the knock app', () => {
    expect(tags({ fieldRole: 'ae_tier_1' })).toEqual(['all', 'knock']);
    expect(tags({ fieldRole: 'entry_level_rep', solarRole: null })).toEqual(['all', 'knock']);
  });

  it('a solar-only rep: solar and knock', () => {
    expect(tags({ solarRole: 'entry_canvasser' })).toEqual(['all', 'knock', 'solar']);
    expect(tags({ solarRole: 'virtual_closer' })).toEqual(['all', 'knock', 'solar']);
  });

  it('a dual rep: solar and knock', () => {
    expect(tags({ fieldRole: 'ae_tier_2', solarRole: 'canvass_closer' })).toEqual(['all', 'knock', 'solar']);
  });

  it('every fiber management role is a manager, and no other fiber role is', () => {
    for (const role of MANAGEMENT_FIELD_ROLES) {
      expect(tags({ fieldRole: role })).toEqual(['all', 'knock', 'manager']);
    }
    for (const role of ['entry_rep', 'entry_level_rep', 'ae_tier_1', 'ae_tier_2', 'gm_in_training', 'internal_rep'] as FieldRole[]) {
      expect(audiencesFor({ fieldRole: role }).has('manager')).toBe(false);
    }
  });

  it('solar canvass manager and directors are managers; other solar roles are not', () => {
    const managers: SolarRole[] = ['canvass_manager', 'marketing_director', 'sales_director'];
    for (const role of SOLAR_ROLES) {
      expect(audiencesFor({ solarRole: role }).has('manager')).toBe(managers.includes(role));
    }
    expect(tags({ solarRole: 'sales_director' })).toEqual(['all', 'knock', 'manager', 'solar']);
  });

  it('admin: solar, knock and manager but not owner', () => {
    expect(tags({ role: 'admin' })).toEqual(['all', 'knock', 'manager', 'solar']);
  });

  it('owner: every tag', () => {
    expect(tags({ role: 'owner' })).toEqual(['all', 'knock', 'manager', 'owner', 'solar']);
  });

  it('operations: knock and manager (the app counts them as managers), no solar, no owner', () => {
    expect(tags({ role: 'operations' })).toEqual(['all', 'knock', 'manager']);
  });

  it('no role at all: everyone only', () => {
    expect(tags({})).toEqual(['all']);
    expect(tags({ solarRole: 'not_a_role' as SolarRole })).toEqual(['all']);
  });
});

describe('notesForAudience', () => {
  const note = (id: string, order: number, audience?: NoteAudience[] | unknown) => ({ id, title: id, order, audience });
  const notes = [
    note('owner-1', 1, ['owner']),
    note('all-2', 2),
    note('solar-1', 3, ['solar']),
    note('mgr-1', 4, ['manager']),
    note('all-1', 1, ['all']),
    note('knock-1', 5, ['knock']),
    note('solar-mgr', 6, ['manager', 'solar']),
    note('legacy-empty', 7, []),
  ];
  const ids = (user: AudienceUser) => notesForAudience(notes, user).map((n) => n.id);

  it('fiber rep: everyone notes then knock notes', () => {
    expect(ids({ fieldRole: 'ae_tier_1' })).toEqual(['all-1', 'all-2', 'legacy-empty', 'knock-1']);
  });

  it('solar rep: adds solar notes, including one also tagged manager', () => {
    expect(ids({ solarRole: 'ae_canvasser' })).toEqual(['all-1', 'all-2', 'legacy-empty', 'solar-1', 'solar-mgr', 'knock-1']);
  });

  it('fiber manager: manager notes but no solar-only ones', () => {
    expect(ids({ fieldRole: 'regional_manager' })).toEqual(['all-1', 'all-2', 'legacy-empty', 'solar-mgr', 'knock-1', 'mgr-1']);
  });

  it('admin: everything but owner notes', () => {
    expect(ids({ role: 'admin' })).toEqual(['all-1', 'all-2', 'legacy-empty', 'solar-1', 'solar-mgr', 'knock-1', 'mgr-1']);
  });

  it('owner: everything, owner notes last', () => {
    expect(ids({ role: 'owner' })).toEqual(['all-1', 'all-2', 'legacy-empty', 'solar-1', 'solar-mgr', 'knock-1', 'mgr-1', 'owner-1']);
  });

  it('no role: only everyone notes', () => {
    expect(ids({})).toEqual(['all-1', 'all-2', 'legacy-empty']);
  });

  it('keeps the everyone prefix identical for every user and ignores input order', () => {
    const prefix = ['all-1', 'all-2', 'legacy-empty'];
    for (const user of [{}, { fieldRole: 'ae_tier_1' as const }, { solarRole: 'entry_canvasser' as const }, { role: 'owner' as const }]) {
      expect(ids(user).slice(0, 3)).toEqual(prefix);
      expect(notesForAudience([...notes].reverse(), user).map((n) => n.id)).toEqual(ids(user));
    }
  });

  it('hasSolarNotes sees a solar tag among the included notes', () => {
    expect(hasSolarNotes(notesForAudience(notes, { fieldRole: 'ae_tier_1' }))).toBe(false);
    expect(hasSolarNotes(notesForAudience(notes, { solarRole: 'entry_canvasser' }))).toBe(true);
  });
});

describe('askLineFor', () => {
  it('fiber only, solar only, both by main line, and admin/owner both', () => {
    expect(askLineFor({ fieldRole: 'ae_tier_1' })).toBe('fiber');
    expect(askLineFor({})).toBe('fiber');
    expect(askLineFor({ solarRole: 'entry_canvasser' })).toBe('solar');
    expect(askLineFor({ fieldRole: 'ae_tier_1', solarRole: 'canvass_closer' })).toBe('fiber+solar');
    expect(askLineFor({ fieldRole: 'ae_tier_1', solarRole: 'canvass_closer' }, 'fiber')).toBe('fiber+solar');
    expect(askLineFor({ fieldRole: 'ae_tier_1', solarRole: 'canvass_closer' }, 'solar')).toBe('solar+fiber');
    expect(askLineFor({ role: 'operations', solarRole: 'sales_director' }, 'solar')).toBe('solar+fiber');
    expect(askLineFor({ role: 'admin' })).toBe('all');
    expect(askLineFor({ role: 'owner', solarRole: 'sales_director' }, 'solar')).toBe('all');
  });
});
