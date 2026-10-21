/**
 * Shared data model. Firestore collections (proposal; dev emulator only until Jacob approves):
 *
 * users/{uid}        Portal-shaped profile + `campaignIds` (turned-on campaigns) and
 *                    `activeCampaignId` (one of them, or null). In the app, owners set them for
 *                    anyone, managers for their team, and a user switches their own active one
 *                    within the list (the portal writes them with the admin SDK).
 * campaigns/{id}     Campaign with its ordered dispositions.
 * houses/{id}        One door (or MDU building) in a carrier pack; carries the display summary
 *                    (`last`, `notHomeCount`, `units`) written by the assigned rep, and
 *                    `managerId` (the assigned rep's manager) so managers can see their team's doors.
 * knocks/{id}        Append-only log of every mark (owners read all; managers their team's via the
 *                    knock's `managerId`; reps their own). Bulk Status changes from a lasso are
 *                    knocks too, flagged `bulk`, and never count in stats.
 * competitions/{id}  Owner-run contest over a time window and campaign(s); everyone signed in reads
 *                    (LOGIC_REQUESTS #25, docs/COMPETITIONS_FEED_SPEC.md).
 * shoutouts/{id}     Team feed: a rep's sale or badge, or a manager/owner's note to the team (#26).
 *
 * All timestamps are epoch milliseconds (numbers) so the same shapes live in SQLite and Firestore.
 */

export type PlatformRole = 'admin' | 'operations' | 'owner';

/** The portal's solar sales roles (`SOLAR_ROLES`, `src/types/auth.ts` in the portal repo). */
export type SolarRole =
  | 'entry_canvasser'
  | 'ae_canvasser'
  | 'canvass_manager'
  | 'canvass_closer'
  | 'in_person_closer'
  | 'virtual_closer'
  | 'marketing_director'
  | 'sales_director';

/** What the knocking app lets a user do. Derived from portal roles in `roles.ts`. */
export type AppRole = 'owner' | 'manager' | 'rep';

export interface UserDoc {
  email: string;
  displayName: string;
  ringColor?: string;
  role?: PlatformRole;
  fieldRole?: string;
  /**
   * The portal's solar sales role (`SOLAR_ROLES` in roles.ts), separate from the fiber `fieldRole`
   * (a rep can have both). Null / absent = no solar.
   */
  solarRole?: string | null;
  status: 'active' | 'inactive' | 'pending';
  managerId?: string | null;
  /** Campaigns turned on for this user (missing on older docs = none). */
  campaignIds?: string[];
  /** The campaign the app shows: one of `campaignIds`, or null. */
  activeCampaignId?: string | null;
  /**
   * Who last changed `activeCampaignId` (uid) and when (epoch ms). Every writer sets both with the
   * change: the app (rules enforce `By` = the writer) and the portal (admin SDK). The rep's
   * "You're on X today" banner shows when someone else changed it after `campaignNoticeAckAt`.
   */
  activeCampaignChangedBy?: string | null;
  activeCampaignChangedAt?: number | null;
  /** The `activeCampaignChangedAt` this user last dismissed the banner for (kept across phones / sign-outs). */
  campaignNoticeAckAt?: number | null;
  /**
   * True on the App Review demo account only: far marks aren't blocked for this user, store builds
   * included (LOGIC_REQUESTS #29). Set by owners from the app (never on themselves) or the admin SDK.
   */
  farBlockExempt?: boolean;
}

export interface Profile {
  uid: string;
  email: string;
  /** `userDisplayName`: the email when the profile has no name. */
  displayName: string;
  /**
   * `shoutoutName`: the name as on the profile ('' when it has none), which shoutouts carry
   * (the rules compare them). Missing on profiles cached before it existed.
   */
  nameOnFile?: string;
  ringColor?: string;
  appRole: AppRole;
  /** `UserDoc.solarRole` when it is a known solar role, else null (missing on profiles cached before it existed). */
  solarRole?: SolarRole | null;
  managerId: string | null;
  /** Campaigns turned on for this user (a rep's switcher lists these). */
  campaignIds: string[];
  activeCampaignId: string | null;
  /** `UserDoc.farBlockExempt === true` (missing on profiles cached before it existed = not exempt). */
  farBlockExempt?: boolean;
}

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

/**
 * Who may work a campaign's doors (LOGIC_REQUESTS #27, OPEN_CAMPAIGNS_SPEC.md). 'locked': each rep
 * sees only doors assigned to them. 'open': every rep with the campaign turned on also sees, and
 * may knock, its unassigned doors; the first knock assigns the door to the knocker.
 */
export type CampaignAccess = 'locked' | 'open';

export interface CampaignDoc {
  name: string;
  type: 'fiber' | 'solar' | 'alarm' | 'other';
  /** Ordered: index 0 is the top/biggest button. */
  dispositions: Disposition[];
  /** Portal provider name the fiber report sends as `companySold` (e.g. 'T-Fiber', 'AT&T'). */
  carrier?: string;
  /**
   * The compact door sheet's results, in order (disposition ids, at most 10; Not Home first). Missing
   * or short = filled from the active results. Read it through `quickPickList`.
   */
  quickPicks?: string[];
  /** Missing = 'locked' (read it through `campaignAccess` in `@/lib/openCampaigns`). */
  access?: CampaignAccess;
  /** Last app edit (campaign editor): epoch ms and the owner's uid (rules enforce `updatedBy`). */
  updatedAt?: number;
  updatedBy?: string;
}

export interface Campaign extends CampaignDoc {
  id: string;
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

/**
 * A lead file's status (#34) kept after a rep marks the door (#35), so History still shows
 * "Imported Oct 15". Never a knock, never counted. Read it with `importedMarkOf` (marking.ts).
 */
export interface ImportedMark {
  mark: Mark;
  notHomeCount: number;
}

export interface UnitState {
  last: Mark | null;
  notHomeCount: number;
  importedMark?: ImportedMark;
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

/**
 * A "No Soliciting" sign at the door (noSoliciting.ts): who saw it and when. Door-level, kept
 * whatever result the door gets; a solar campaign skips the door (pin, no deck).
 */
export interface NoSolicitingSign {
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
  /** The house's imported result after a rep re-marked it (#35); see `ImportedMark`. */
  importedMark?: ImportedMark;
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
   * Drawn-area import (docs/AREA_IMPORT_API.md): the `areaImports` record that added this door.
   * Removing that area deletes the door only while nobody has touched it (`isUntouchedDoor`).
   */
  areaImportId?: string;
  /** Drawn-area import: the tax roll's first owner name, display case ("Smith John A"). Missing = none / unknown. */
  ownerName?: string;
  /** Drawn-area import, condo building: owner name per unit label (missing entry = none). */
  unitOwnerNames?: Record<string, string>;
  /** Drawn-area import: the roll's homestead flag (a condo building: more than half its units). Same as `ownerOccupied`. */
  homestead?: boolean;
  /** Drawn-area import: the DOR use code ('001' single family, '002' mobile home, '004' condo, '008' multi-family 2-9). */
  useType?: '001' | '002' | '004' | '008';
  /**
   * Door note on the house or MDU building (LOGIC_REQUESTS #18, doorNotes.ts): typed on its own,
   * never a visit. Missing = none. Edit = replace.
   */
  doorNote?: DoorNote;
  /** Door notes on MDU units, by unit label (missing entry = none). */
  unitNotes?: Record<string, DoorNote>;
  /** The latest note change (which door, who, when); the rules check note writes against it. */
  noteEdit?: NoteEdit;
  /** The door has a No Soliciting sign (noSoliciting.ts). Missing = none seen. */
  noSoliciting?: NoSolicitingSign;
}

export interface House extends HouseDoc {
  id: string;
}

export interface KnockDoc {
  houseId: string;
  unit: string | null;
  campaignId: string;
  repId: string;
  /**
   * The knocking user's manager when the knock was made (their `users/{repId}.managerId`; null = none).
   * Rules enforce it on create; managers read knocks where this is them (their team's). Older knocks lack it.
   */
  managerId?: string | null;
  dispositionId: string;
  note: string | null;
  appointmentAt: number | null;
  createdAt: number;
  /** Rep position when marking (no background tracking). */
  lat: number | null;
  lng: number | null;
  /** Metres from the rep to the house; null when GPS was unavailable. */
  distanceM: number | null;
  /**
   * True when the rep's location couldn't be verified at the tap (weak, stale or no GPS); owners see
   * the flag. A good fix farther than FAR_METERS is refused, so it never produces a knock.
   */
  far: boolean;
  /** Horizontal accuracy of the fix in metres (null when unknown or no fix). Older knocks lack it. */
  accuracyM?: number | null;
  /** How the location was judged at the tap (see `checkProximity`). Older knocks lack it. */
  gps?: 'good' | 'weak' | 'none';
  /** Knock this one replaced (same door re-marked within the replace window). */
  replacesId: string | null;
  /**
   * Lasso Status change by an owner/manager (`repId` is who made it). Never counts in Doors,
   * Contacts or Sales. A reset (back to unknocked) uses `RESET_DISPOSITION_ID` (turf.ts).
   */
  bulk?: true;
}

export interface Knock extends KnockDoc {
  id: string;
}

/**
 * Sale drafts live in the 3C portal (Firestore `saleDrafts`, written only through the portal API).
 * Every Sold creates one; the rep may add a customer name and plan in the app, then finishes the
 * sale on the portal's Log sale page. `clientId` is the knock id, so re-sending is idempotent.
 */
export interface SaleDraftInput {
  clientId: string;
  /** House address, plus ` #unit` for an MDU unit. */
  address: string;
  soldAt: number;
  customerName: string | null;
  /** Portal plan id (`SalePlan.id`). */
  planId: string | null;
  source: 'knock';
  houseId: string;
  knockId: string;
  campaignId: string;
}

/** Optional details from the Sold bar's "Add details". Omitted = unchanged; null or '' = cleared. */
export interface SaleDetails {
  customerName?: string | null;
  planId?: string | null;
}

/** An open draft as the portal lists it. */
export interface SaleDraft {
  id: string;
  clientId: string | null;
  address: string;
  soldAt: number;
  customerName: string | null;
  planId: string | null;
}

/** A plan from the portal's plan list (`FIBER_PLANS`), for the Add details picker. */
export interface SalePlan {
  id: string;
  company: string;
  name: string;
}

/** What a competition ranks by: a leaderboard metric (#23), or points per result. */
export type CompetitionMetric = 'doors' | 'talked' | 'sold' | 'appointments' | 'points';

/**
 * Points a counted knock earns with metric 'points': the highest value it qualifies for (a sale
 * that is also a talk earns `sale`, not `sale + talked`). `door` is what any other counted knock earns.
 */
export interface PointsTable {
  door: number;
  talked: number;
  appointment: number;
  sale: number;
}

export interface CompetitionDoc {
  name: string;
  startAt: number;
  endAt: number;
  /** Knocks in these campaigns count (1-30). */
  campaignIds: string[];
  metric: CompetitionMetric;
  /** Set with metric 'points', else null. */
  points: PointsTable | null;
  /** Rep against rep, or team against team (a team = a manager and the reps pointing at them). */
  mode: 'rep' | 'team';
  prize: string | null;
  /** 'ended' once an owner ends it (early or not); a competition past `endAt` is over either way. */
  status: 'active' | 'ended';
  /** When an owner ended it; knocks after this don't count. Null while active. */
  endedAt: number | null;
  createdBy: string;
  createdAt: number;
  updatedBy: string;
  updatedAt: number;
}

export interface Competition extends CompetitionDoc {
  id: string;
}

export type ShoutoutKind = 'sale' | 'badge' | 'manual';

export interface ShoutoutDoc {
  kind: ShoutoutKind;
  /** Who it is about (sale/badge) or who wrote it (manual). Rules: always the writer. */
  repId: string;
  /** The writer's display name (reps can't read other people's profiles). */
  repName: string;
  /**
   * The team it goes to: the writer's manager, or the writer themselves when they lead a team.
   * Null = users with no manager.
   */
  managerId: string | null;
  /** Owner broadcast to everyone. */
  toAll: boolean;
  campaignId: string | null;
  /** Sale: street name only, never the house number (privacy). */
  street: string | null;
  /** Manual: the message. Badge: the badge label. Sale: null. */
  text: string | null;
  /** Badge shoutouts: the badge id (#24). */
  badgeId: string | null;
  at: number;
}

export interface Shoutout extends ShoutoutDoc {
  id: string;
}
