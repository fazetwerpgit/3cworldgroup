import {
  MANAGEMENT_FIELD_ROLES,
  isAdminLevel,
  isOwner,
  isSolarRole,
  permissionsFor,
  type FieldRole,
  type MainLine,
  type PlatformRole,
  type SolarRole,
} from '@/types/auth';
import { sortNotes } from './notes';

// Who each Ask 3C knowledge note is for. A note carries `audience` tags; it
// goes into a user's prompt when any one tag passes for them. Eligibility is
// worked out from the server-verified user (requireVerifiedUser), never from
// anything the client sends.

export const NOTE_AUDIENCES = ['all', 'solar', 'knock', 'manager', 'owner'] as const;
export type NoteAudience = (typeof NOTE_AUDIENCES)[number];

/** The owner's labels for the tags (Knowledge chips). */
export const NOTE_AUDIENCE_LABELS: Record<NoteAudience, string> = {
  all: 'Everyone',
  solar: 'Solar',
  knock: 'Chompen app',
  manager: 'Managers',
  owner: 'Owners',
};

export function isNoteAudience(value: unknown): value is NoteAudience {
  return typeof value === 'string' && (NOTE_AUDIENCES as readonly string[]).includes(value);
}

/**
 * A stored or sent audience in canonical form: missing or empty reads as
 * ['all'] (every note written before tags existed); 'all' alongside other tags
 * is just ['all']; the rest deduplicated in NOTE_AUDIENCES order. A value that
 * is there but holds no known tag (a typo, a tag from a newer build, a bad
 * write) fails closed to ['owner'], so it never reaches reps.
 */
export function normalizeAudience(raw: unknown): NoteAudience[] {
  if (raw === undefined || raw === null || (Array.isArray(raw) && raw.length === 0)) return ['all'];
  const tags = Array.isArray(raw) ? raw.filter(isNoteAudience) : [];
  if (tags.length === 0) return ['owner'];
  if (tags.includes('all')) return ['all'];
  return NOTE_AUDIENCES.filter((tag) => tags.includes(tag));
}

/** A sent audience, checked: undefined when not sent, an error when it holds anything but known tags. */
export function parseAudience(raw: unknown): { ok: true; audience: NoteAudience[] | undefined } | { ok: false; error: string } {
  if (raw === undefined) return { ok: true, audience: undefined };
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > NOTE_AUDIENCES.length * 2 || !raw.every(isNoteAudience)) {
    return { ok: false, error: 'Pick who sees this note: Everyone, Solar, Chompen app, Managers or Owners' };
  }
  return { ok: true, audience: normalizeAudience(raw) };
}

export interface AudienceUser {
  role?: PlatformRole;
  fieldRole?: FieldRole;
  solarRole?: SolarRole | null;
}

// Solar's management seats (the fiber ones are MANAGEMENT_FIELD_ROLES).
const SOLAR_MANAGER_ROLES: readonly SolarRole[] = ['canvass_manager', 'marketing_director', 'sales_director'];

/**
 * The tags a user passes.
 * - all: everyone.
 * - solar: permissionsFor grants solar:read (any solar role, or admin/owner).
 * - knock: anyone in the field on either side (a fieldRole or a solarRole),
 *   plus the back office (admin, owner, operations). The 3C Doors (Chompen)
 *   app lets in any active portal user and treats owner/admin as owners and
 *   operations as a manager (firestore.rules hasAccess/isOwner/isManagerRole).
 * - manager: MANAGEMENT_FIELD_ROLES, solar canvass_manager, marketing_director
 *   and sales_director, plus admin, owner and operations (isManagerRole in the
 *   app's rules counts operations as a manager).
 * - owner: the owner role only.
 */
export function audiencesFor(user: AudienceUser): Set<NoteAudience> {
  const tags = new Set<NoteAudience>(['all']);
  const backOffice = isAdminLevel(user.role) || user.role === 'operations';
  const solarRole = isSolarRole(user.solarRole) ? user.solarRole : null;
  if (permissionsFor(user).includes('solar:read')) tags.add('solar');
  if (backOffice || user.fieldRole || solarRole) tags.add('knock');
  if (
    backOffice ||
    (user.fieldRole && MANAGEMENT_FIELD_ROLES.includes(user.fieldRole)) ||
    (solarRole && SOLAR_MANAGER_ROLES.includes(solarRole))
  ) {
    tags.add('manager');
  }
  if (isOwner(user.role)) tags.add('owner');
  return tags;
}

/**
 * The notes this user's prompt gets, in a stable order for the prompt cache:
 * every note tagged 'all' first, in sortNotes order (identical for everyone),
 * then the solar, knock, manager and owner notes, each group in sortNotes
 * order. A note tagged with several audiences sits in the group of its first
 * tag, so it appears once.
 */
export function notesForAudience<T extends { id: string; title: string; order: number; audience?: unknown }>(
  notes: T[],
  user: AudienceUser
): T[] {
  const passes = audiencesFor(user);
  const groups = new Map<NoteAudience, T[]>(NOTE_AUDIENCES.map((tag) => [tag, []]));
  for (const note of sortNotes(notes)) {
    const tags = normalizeAudience(note.audience);
    if (tags.some((tag) => passes.has(tag))) groups.get(tags[0])!.push(note);
  }
  return NOTE_AUDIENCES.flatMap((tag) => groups.get(tag)!);
}

/** Whether any of these notes is tagged for solar (the solar answer rules then apply). */
export function hasSolarNotes(notes: { audience?: unknown }[]): boolean {
  return notes.some((note) => normalizeAudience(note.audience).includes('solar'));
}

/**
 * What the user sells, for the prompt's opening line: 'fiber' (fiber only, or
 * no line at all), 'solar' (a solar role and no fiber or platform role),
 * 'fiber+solar' / 'solar+fiber' (both, main line first), 'all' (admin/owner).
 */
export type AskLine = 'fiber' | 'solar' | 'fiber+solar' | 'solar+fiber' | 'all';

export function askLineFor(user: AudienceUser, mainLine?: MainLine | null): AskLine {
  if (isAdminLevel(user.role)) return 'all';
  const solar = isSolarRole(user.solarRole);
  if (!solar) return 'fiber';
  if (!user.fieldRole && !user.role) return 'solar';
  return mainLine === 'solar' ? 'solar+fiber' : 'fiber+solar';
}
