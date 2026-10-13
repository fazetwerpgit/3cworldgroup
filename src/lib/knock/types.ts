// The 3C Doors house shape, copied from 3c-knock-logic src/lib/types.ts at commit 55ca6ae: only
// the types leadImport.ts needs. A house is a top-level Firestore doc `houses/{id}` written by
// the app and, for lead imports, by the portal (admin SDK). Keep in step with the app repo.

/** The latest effective mark on a house or MDU unit. */
export interface Mark {
  dispositionId: string;
  at: number;
  repId: string;
  knockId: string;
  /** Set by an owner/manager lasso Status change: a later mark never replaces it. */
  bulk?: true;
}

export interface UnitState {
  last: Mark | null;
  notHomeCount: number;
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
  /** Contact first name from a lead import. */
  contactName?: string;
}

export interface House extends HouseDoc {
  id: string;
}
