// The 3C Doors house and result types, copied from 3c-knock-logic src/lib/types.ts at commit f289f43:
// only the types leadImport.ts needs (sections copied as they are). A house is a top-level Firestore
// doc `houses/{id}` written by the app and, for lead imports, by the portal (admin SDK); a
// campaign's `dispositions` are `Disposition`s. Keep in step with the app repo.

/** Porch result icons (`design/icons-final/icons.js`), drawn by `components/result-icon.tsx`. */
export type GlyphKey =
  | 'dollar'
  | 'check'
  | 'xmark'
  | 'goback'
  | 'bars'
  | 'thumbdown'
  | 'flag'
  | 'cart'
  | 'banknote'
  | 'key'
  | 'mappin'
  | 'calendar'
  | 'clock'
  | 'building'
  | 'house'
  | 'bolt'
  | 'star'
  | 'phone'
  | 'note'
  | 'ellipsis';

/** Special behaviour some dispositions carry beyond the owner-set switches. */
export type DispositionKind = 'notHome' | 'customer' | 'mdu' | null;

export interface Disposition {
  id: string;
  label: string;
  color: string;
  glyph: GlyphKey;
  /** Counts as "talked to someone" in daily numbers. */
  contact: boolean;
  /** Pops up a notes box. */
  notes: boolean;
  /** Pops up an (optional) appointment time. */
  appointment: boolean;
  /** Counts as a sale. */
  sale: boolean;
  /** Same mark shows on every campaign at this address (MDU, Vacant). */
  everyCampaign: boolean;
  kind: DispositionKind;
  /**
   * Retired by an owner (campaign editor): no longer offered for new marks, but old knocks and pins
   * still resolve and draw it. Missing = active. Dispositions are never deleted.
   */
  archived?: boolean;
}

/** The latest effective mark on a house or MDU unit. */
export interface Mark {
  dispositionId: string;
  at: number;
  repId: string;
  knockId: string;
  /** Set by an owner/manager lasso Status change: a later mark never replaces it. */
  bulk?: true;
  /**
   * The status a lead file gave the door at import (LOGIC_REQUESTS #34): no knock behind it
   * (`knockId` ''), `repId` = the importing owner. Shows on the pin like any result but never counts
   * as a visit (stats, points, badges, competitions and pack reports read knocks only), and a later
   * mark never replaces it as "the same visit".
   */
  imported?: true;
  /** Imported marks only: the appointment time from the lead file (epoch ms), when its result takes one. */
  appointmentAt?: number;
}

export interface UnitState {
  last: Mark | null;
  notHomeCount: number;
}

/** Kind of home, from the county tax roll's DOR use code (area import, AREA_IMPORT_SPEC.md). */
export type PropertyType = 'single-family' | 'mobile-home' | 'condo' | 'multi-family';

/** A door note (doorNotes.ts): the text, who wrote it last (uid) and when (epoch ms). */
export interface DoorNote {
  text: string;
  by: string;
  at: number;
}

/** Stamp of a house's latest note change: `unit` null = the house / building note. */
export interface NoteEdit {
  unit: string | null;
  by: string;
  at: number;
}

/** Who lives / works at a door, from a lead import (LOGIC_REQUESTS #34). Missing fields = not given. */
export interface Contact {
  /** First + last name (or the file's single name column). */
  name?: string;
  business?: string;
  phone?: string;
  email?: string;
}

export interface HouseDoc {
  campaignId: string;
  packId: string;
  /** Carrier pack name, e.g. "gt217". */
  packName: string;
  address: string;
  city: string;
  lat: number;
  lng: number;
  assignedRepId: string | null;
  /**
   * The assigned rep's manager (copied from users/{assignedRepId}.managerId on every assignment;
   * null when unassigned or the rep has none). Managers read and lasso houses where this is them.
   */
  managerId: string | null;
  last: Mark | null;
  notHomeCount: number;
  /** MDU unit order; null for a single-family house. */
  unitOrder: string[] | null;
  units: Record<string, UnitState> | null;
  /** Set when a rep drags the pin; owners see it moved. */
  movedBy: string | null;
  /** Set when a rep drops a missing house. */
  createdBy: string | null;
  updatedAt: number;
  /** Imported without a street address; the app fills `address`/`city` by reverse geocoding on first open. */
  addressPending?: true;
  /** Contact from a lead import (house or MDU building). Missing = none. Owners write it; nobody edits it in the app yet. */
  contact?: Contact;
  /** Lead-import contacts of MDU units, by unit label (missing entry = none). */
  unitContacts?: Record<string, Contact>;
  /**
   * Area import (county tax roll): the owner lives there, i.e. the parcel has a homestead exemption.
   * A condo building (one door, units = condos): more than half of its units do. Missing = unknown
   * (carrier lead imports, rep-dropped doors).
   */
  ownerOccupied?: boolean;
  /** Area import: the kind of home (from the DOR use code). Missing = unknown. */
  propertyType?: PropertyType;
  /**
   * Door note on the house or MDU building (LOGIC_REQUESTS #18, doorNotes.ts): typed on its own,
   * never a visit. Missing = none. Edit = replace.
   */
  doorNote?: DoorNote;
  /** Door notes on MDU units, by unit label (missing entry = none). */
  unitNotes?: Record<string, DoorNote>;
  /** The latest note change (which door, who, when); the rules check note writes against it. */
  noteEdit?: NoteEdit;
}

export interface House extends HouseDoc {
  id: string;
}
