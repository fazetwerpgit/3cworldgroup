import { cleanDlNumber, cleanSsn } from '@/lib/onboarding/sensitiveFields';
import { formatPhone } from '@/lib/sales/scan/normalize';
import { last4 } from '@/lib/security/fieldEncryption';
import { validateAddress, type AddressFields } from '@/lib/validation/address';
import { isShirtSize, type ShirtSize } from '@/types/auth';
import type { SheetRow } from './parseSheet';

// Decides, for every active portal user, which EMPTY profile fields the owner's
// spreadsheet fills. Nothing already in the portal is ever overwritten. The plan
// carries the values the route writes; only toPersonView() leaves this module in
// a response, and it carries field names, never values.

export type ImportField = 'phone' | 'address' | 'shirt' | 'ssn' | 'dl';

export interface PortalUser {
  uid: string;
  data: Record<string, unknown>;
}

export interface SensitiveOnFile {
  ssnEncrypted?: unknown;
  ssnLast4?: unknown;
  dlNumberEncrypted?: unknown;
}

export interface PersonPlan {
  uid: string;
  name: string;
  userUpdates: AddressFields & { phone?: string; shirtSize?: ShirtSize };
  sensitive: { ssn?: string; dlNumber?: string };
  willFill: ImportField[];
  keptExisting: ImportField[];
  issues: string[];
}

export interface PersonView {
  name: string;
  willFill: ImportField[];
  keptExisting: ImportField[];
  issues: string[];
}

export interface SheetMatch {
  pairs: { user: PortalUser; row: SheetRow }[];
  skipped: { name: string; reason: string }[];
  sheetRows: number;
  /** Sheet rows no active portal user matched. Counted, never named. */
  unmatchedRows: number;
}

export type ImportPlan = Omit<SheetMatch, 'pairs'> & { people: PersonPlan[] };

// Portal name -> the name the sheet uses for the same person (Jacob's call).
const NAME_ALIASES: Record<string, string> = { wilteasdale: 'williamteasdale' };

const SHIRT_ALIASES: Record<string, ShirtSize> = {
  XXL: '2XL',
  XXXL: '3XL',
  XXXXL: '4XL',
  XSMALL: 'XS',
  SMALL: 'S',
  MEDIUM: 'M',
  LARGE: 'L',
  XLARGE: 'XL',
};

const COUNTRY_LINE = /^(us|usa|united states(?: of america)?)$/i;
// "street[, more street], City, ST 12345" once the lines are joined with commas.
const ADDRESS = /^(.+),\s*([^,]+),\s*([A-Za-z]{2})\.?\s+(\d{5}(?:-\d{4})?)$/;

/** Letters only, lowercase, accents folded: "O'Neil-Ray Jr." -> "oneilrayjr". */
export function normalizeName(name: string): string {
  return name.normalize('NFD').toLowerCase().replace(/[^a-z]/g, '');
}

/**
 * "2172 North Oak Ct\nCoralville, IA 52241\nUS" -> street/city/state/zip. Extra
 * middle lines (an apartment) join the street; a country line is dropped; a
 * one-line "street, City, ST 12345" also reads. Returns null unless all four
 * parts come out valid.
 */
export function parseSheetAddress(raw: string): Required<AddressFields> | null {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line && !COUNTRY_LINE.test(line));
  const match = ADDRESS.exec(lines.join(', '));
  if (!match) return null;

  const checked = validateAddress({
    address: match[1].trim(),
    city: match[2].trim(),
    state: match[3].toUpperCase(),
    zip: match[4],
  });
  if (!checked.ok) return null;
  const { address, city, state, zip } = checked.clean;
  return address && city && state && zip ? { address, city, state, zip } : null;
}

export function toShirtSize(raw: string): ShirtSize | null {
  const key = raw.toUpperCase().replace(/[\s.-]/g, '');
  if (isShirtSize(key)) return key;
  return SHIRT_ALIASES[key] ?? null;
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim() === '');
}

function planPerson(user: PortalUser, name: string, row: SheetRow, onFile: SensitiveOnFile): PersonPlan {
  const plan: PersonPlan = {
    uid: user.uid,
    name,
    userUpdates: {},
    sensitive: {},
    willFill: [],
    keptExisting: [],
    issues: [],
  };
  const data = user.data;

  if (row.phone) {
    const phone = formatPhone(row.phone);
    if (!isBlank(data.phone)) plan.keptExisting.push('phone');
    else if (!phone) plan.issues.push('Phone is not a 10-digit number (skipped)');
    else {
      plan.userUpdates.phone = phone;
      plan.willFill.push('phone');
    }
  }

  // The address is one unit: a new street under an old city would be wrong, so
  // any part already in the portal keeps the whole address.
  if (row.address) {
    const address = parseSheetAddress(row.address);
    if ([data.address, data.city, data.state, data.zip].some((part) => !isBlank(part))) {
      plan.keptExisting.push('address');
    } else if (!address) plan.issues.push('Address could not be read (skipped)');
    else {
      Object.assign(plan.userUpdates, address);
      plan.willFill.push('address');
    }
  }

  if (row.shirtSize) {
    const shirt = toShirtSize(row.shirtSize);
    if (!isBlank(data.shirtSize)) plan.keptExisting.push('shirt');
    else if (!shirt) plan.issues.push('Shirt size not recognized (skipped)');
    else {
      plan.userUpdates.shirtSize = shirt;
      plan.willFill.push('shirt');
    }
  }

  if (row.ssn) {
    const ssn = cleanSsn(row.ssn);
    if (!isBlank(onFile.ssnEncrypted)) {
      plan.keptExisting.push('ssn');
      if (ssn && typeof onFile.ssnLast4 === 'string' && onFile.ssnLast4 !== last4(ssn)) {
        plan.issues.push('SSN on file differs (kept portal)');
      }
    } else if (!ssn) plan.issues.push('SSN is not 9 digits (skipped)');
    else {
      plan.sensitive.ssn = ssn;
      plan.willFill.push('ssn');
    }
  }

  if (row.dlNumber) {
    const dl = cleanDlNumber(row.dlNumber);
    if (!isBlank(onFile.dlNumberEncrypted)) plan.keptExisting.push('dl');
    else if (!dl) plan.issues.push("Driver's license number not valid (skipped)");
    else {
      plan.sensitive.dlNumber = dl;
      plan.willFill.push('dl');
    }
  }

  return plan;
}

/**
 * Matches each active user to exactly one sheet row: by email first
 * (case-insensitive), else by normalized full name. A user with no row, several
 * rows, or a row another user also matched is skipped and listed, so one
 * person's details can never land on someone else.
 */
export function matchUsers(users: PortalUser[], rows: SheetRow[]): SheetMatch {
  const candidates = new Map<string, number[]>();
  const claims = new Map<number, number>();

  for (const user of users) {
    const email = typeof user.data.email === 'string' ? user.data.email.trim().toLowerCase() : '';
    let found = email ? rows.flatMap((row, index) => (row.email === email ? [index] : [])) : [];
    if (found.length === 0) {
      const portalName = normalizeName(String(user.data.displayName ?? ''));
      const names = new Set([portalName, NAME_ALIASES[portalName]].filter(Boolean));
      found = portalName ? rows.flatMap((row, index) => (names.has(normalizeName(row.name)) ? [index] : [])) : [];
    }
    candidates.set(user.uid, found);
    for (const index of found) claims.set(index, (claims.get(index) ?? 0) + 1);
  }

  const pairs: SheetMatch['pairs'] = [];
  const skipped: SheetMatch['skipped'] = [];
  for (const user of users) {
    const found = candidates.get(user.uid) ?? [];
    const name = displayNameOf(user);
    if (found.length === 0) skipped.push({ name, reason: 'Not in the sheet' });
    else if (found.length > 1) skipped.push({ name, reason: `Matches ${found.length} rows in the sheet` });
    else if ((claims.get(found[0]) ?? 0) > 1) {
      skipped.push({ name, reason: 'Same sheet row as another portal user' });
    } else pairs.push({ user, row: rows[found[0]] });
  }
  skipped.sort((a, b) => a.name.localeCompare(b.name));

  return {
    pairs,
    skipped,
    sheetRows: rows.length,
    unmatchedRows: rows.filter((_, index) => !claims.has(index)).length,
  };
}

function displayNameOf(user: PortalUser): string {
  const name = typeof user.data.displayName === 'string' ? user.data.displayName.trim() : '';
  return name || '(no name on file)';
}

export function buildImportPlan(match: SheetMatch, sensitiveByUid: Map<string, SensitiveOnFile>): ImportPlan {
  const people = match.pairs
    .map(({ user, row }) => planPerson(user, displayNameOf(user), row, sensitiveByUid.get(user.uid) ?? {}))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { sheetRows: match.sheetRows, unmatchedRows: match.unmatchedRows, people, skipped: match.skipped };
}

export function toPersonView(plan: PersonPlan): PersonView {
  return { name: plan.name, willFill: plan.willFill, keptExisting: plan.keptExisting, issues: plan.issues };
}
