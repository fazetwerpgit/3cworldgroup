// Server-only solar helpers: the access gate, consultant lookup, availability
// loading and alert recipients. Admin SDK only (the solar collections are
// closed to clients in firestore.rules).
import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireVerifiedUser } from '@/lib/auth/requireVerifiedAdmin';
import { permissionsFor } from '@/types/auth';
import {
  SOLAR_SLOT_MIN,
  seedAvailability,
  type SolarAvailability,
  type SolarBookingLike,
  type WeeklyWindow,
} from '@/lib/solar/availability';
import { LEGACY_TZ } from '@/lib/solar/timezones';

export const JACOB_EMAIL = 'jmyers@3cworldgroup.com';

type Gate = Awaited<ReturnType<typeof requireVerifiedUser>>;
export type SolarGate = Extract<Gate, { ok: true }> | { ok: false; error: string; status: number };

/**
 * requireVerifiedUser + solar:write (a solar role, or admin/owner through
 * ADMIN_PERMISSIONS). 403 otherwise. The gate already carries the roles, so
 * there is no second users/{uid} read.
 */
export async function requireSolarUser(request: NextRequest): Promise<SolarGate> {
  const gate = await requireVerifiedUser(request);
  if (!gate.ok) return gate;
  if (!permissionsFor(gate).includes('solar:write')) {
    return { ok: false, error: 'Forbidden', status: 403 };
  }
  return gate;
}

export interface UserContact {
  uid: string;
  name: string;
  email: string;
}

function contactOf(uid: string, data: Record<string, unknown> | undefined): UserContact {
  const email = String(data?.email ?? data?.Email ?? '').trim();
  const name = String(data?.displayName ?? '').trim() || email || uid;
  return { uid, name, email };
}

function emailOf(data: Record<string, unknown>): string {
  return String(data.Email ?? data.email ?? '').trim().toLowerCase();
}

/**
 * The owner and Jacob, looked up at runtime so no uid is hard-coded: Jacob by
 * email, the owner as the role 'owner' user who is not Jacob. The owner
 * notification rule (leadAlertUids, consultantNotice) and the in-person
 * booking preference need both; the consultant list lives in
 * solarAvailability and only uses them as the seed while that is empty.
 */
export async function resolveConsultants(): Promise<{ owner: UserContact | null; jacob: UserContact | null }> {
  if (!adminDb) return { owner: null, jacob: null };
  const users = adminDb.collection('users');
  const [byEmailCap, byEmailLower, owners] = await Promise.all([
    users.where('Email', '==', JACOB_EMAIL).limit(1).get(),
    users.where('email', '==', JACOB_EMAIL).limit(1).get(),
    users.where('role', '==', 'owner').get(),
  ]);
  const jacobDoc = byEmailCap.docs[0] ?? byEmailLower.docs[0];
  const jacob = jacobDoc ? contactOf(jacobDoc.id, jacobDoc.data()) : null;
  const ownerDoc = owners.docs.find((d) => d.id !== jacob?.uid && emailOf(d.data()) !== JACOB_EMAIL);
  const owner = ownerDoc ? contactOf(ownerDoc.id, ownerDoc.data()) : null;
  return { owner, jacob };
}

function cleanWindows(value: unknown): WeeklyWindow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((w): w is Record<string, unknown> => !!w && typeof w === 'object')
    .map((w) => ({ day: Number(w.day), start: String(w.start ?? ''), end: String(w.end ?? '') }))
    .filter((w) => Number.isInteger(w.day) && w.day >= 0 && w.day <= 6);
}

/** One solarAvailability doc as the slot math reads it. */
export function availabilityOf(id: string, data: Record<string, unknown>): SolarAvailability {
  const modes = (data.modes ?? {}) as Record<string, unknown>;
  return {
    consultantUid: id,
    name: String(data.name ?? '') || 'Consultant',
    tz: typeof data.tz === 'string' && data.tz ? data.tz : LEGACY_TZ,
    slotMin: Number(data.slotMin) > 0 ? Number(data.slotMin) : SOLAR_SLOT_MIN,
    modes: { virtual: cleanWindows(modes.virtual), in_person: cleanWindows(modes.in_person) },
  };
}

/**
 * The consultants set in Admin > Solar > Setup (solarAvailability), sorted by
 * name. While that collection is empty the seed (owner + Jacob) stands in and
 * `seeded` is true; the first save in Setup writes the whole seed.
 */
export async function loadConsultants(): Promise<{ consultants: SolarAvailability[]; seeded: boolean }> {
  if (!adminDb) return { consultants: [], seeded: false };
  const snap = await adminDb.collection('solarAvailability').get();
  if (!snap.empty) {
    const consultants = snap.docs.map((doc) => availabilityOf(doc.id, doc.data()));
    return { consultants: consultants.sort((a, b) => a.name.localeCompare(b.name)), seeded: false };
  }
  const { owner, jacob } = await resolveConsultants();
  return { consultants: seedAvailability(owner, jacob), seeded: true };
}

/** solarAvailability docs, or the seed (owner + Jacob) while the collection is empty. */
export async function loadAvailability(): Promise<SolarAvailability[]> {
  return (await loadConsultants()).consultants;
}

async function solarSettings(): Promise<Record<string, unknown>> {
  if (!adminDb) return {};
  const snap = await adminDb.collection('settings').doc('solar').get();
  return (snap.exists ? snap.data() : undefined) ?? {};
}

/**
 * settings/solar.notifyOwner === true. Off by default (Jacob's rule): while it
 * is off, no solar notification, push or email goes to the owner.
 */
export async function ownerNotificationsEnabled(): Promise<boolean> {
  return (await solarSettings()).notifyOwner === true;
}

/**
 * Who gets the lead alert. Jacob only, unless settings/solar.notifyOwner is on
 * and settings/solar.leadAlertUids is set. The owner is never on the list while
 * owner notifications are off.
 */
export async function leadAlertUids(): Promise<string[]> {
  if (!adminDb) return [];
  const [settings, { owner, jacob }] = await Promise.all([solarSettings(), resolveConsultants()]);
  const notifyOwner = settings.notifyOwner === true;
  const configured = Array.isArray(settings.leadAlertUids)
    ? settings.leadAlertUids.filter((v): v is string => typeof v === 'string' && v.length > 0)
    : [];
  const uids = notifyOwner && configured.length > 0 ? configured : jacob ? [jacob.uid] : [];
  return [...new Set(uids)].filter((uid) => notifyOwner || uid !== owner?.uid);
}

export interface ConsultantNotice {
  /** Who gets the consultant's booking notice, or null for nobody. */
  to: UserContact | null;
  /** Prepended to the notice title ('' when it goes to the consultant). */
  titlePrefix: string;
  /** Reply-to for the customer's confirmation email ('' to leave it unset). */
  replyTo: string;
}

/**
 * Where a booking's consultant notice goes. Normally the consultant. When the
 * consultant is the owner and owner notifications are off, Jacob gets it
 * instead, marked "[Owner's calendar]", and customer replies go to Jacob too.
 */
export async function consultantNotice(consultantUid: string): Promise<ConsultantNotice> {
  const [notifyOwner, { owner, jacob }, [consultant]] = await Promise.all([
    ownerNotificationsEnabled(),
    resolveConsultants(),
    loadContacts([consultantUid]),
  ]);
  if (owner && consultantUid === owner.uid && !notifyOwner) {
    return { to: jacob, titlePrefix: "[Owner's calendar] ", replyTo: jacob?.email ?? '' };
  }
  return { to: consultant ?? null, titlePrefix: '', replyTo: consultant?.email ?? '' };
}

export async function loadContacts(uids: string[]): Promise<UserContact[]> {
  if (!adminDb || uids.length === 0) return [];
  const db = adminDb;
  const snaps = await Promise.all(uids.map((uid) => db.collection('users').doc(uid).get()));
  return snaps.filter((s) => s.exists).map((s) => contactOf(s.id, s.data()));
}

const DAY = 86_400_000;

/** Bookings whose start falls in [fromISO - 1 day, toISO): enough to block any overlap. */
export async function loadBookings(from: Date, to: Date): Promise<SolarBookingLike[]> {
  if (!adminDb) return [];
  const snap = await adminDb
    .collection('solarBookings')
    .where('start', '>=', new Date(from.getTime() - DAY).toISOString())
    .where('start', '<', to.toISOString())
    .get();
  return snap.docs.map((d) => ({
    consultantUid: String(d.get('consultantUid') ?? ''),
    start: String(d.get('start') ?? ''),
    end: typeof d.get('end') === 'string' ? d.get('end') : undefined,
    status: typeof d.get('status') === 'string' ? d.get('status') : undefined,
  }));
}

