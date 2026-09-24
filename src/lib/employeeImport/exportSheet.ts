import ExcelJS from 'exceljs';
import { installDayKey } from '@/lib/sales/saleDate';
import { decryptField } from '@/lib/security/fieldEncryption';
import { getEffectiveRole, repFacingRoleLabel, type FieldRole, type PlatformRole } from '@/types/auth';

// Builds the owner's employee data export (drug / background checks) in memory.
// It carries FULL SSN and driver's license numbers: the workbook buffer goes
// straight into the response and is never stored, logged, or returned anywhere
// else.

export const UNREADABLE = 'unreadable';

export interface ExportUser {
  uid: string;
  data: Record<string, unknown>;
}

export interface ExportSensitive {
  ssnEncrypted?: unknown;
  dlNumberEncrypted?: unknown;
  backgroundCheckAuth?: unknown;
}

const COLUMNS = [
  { header: 'Name', key: 'name', width: 26 },
  { header: 'Phone', key: 'phone', width: 16 },
  { header: 'Email', key: 'email', width: 30 },
  { header: 'Street', key: 'street', width: 30 },
  { header: 'City', key: 'city', width: 18 },
  { header: 'State', key: 'state', width: 8 },
  { header: 'ZIP', key: 'zip', width: 10 },
  { header: 'Shirt size', key: 'shirt', width: 11 },
  { header: 'Role', key: 'role', width: 24 },
  { header: 'Hire date', key: 'hireDate', width: 12 },
  { header: 'SSN', key: 'ssn', width: 13 },
  { header: "Driver's license #", key: 'dl', width: 20 },
  { header: 'Background consent', key: 'consent', width: 20 },
] as const;

type ColumnKey = (typeof COLUMNS)[number]['key'];
export type ExportRow = Record<ColumnKey, string>;

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** "123456789" -> "123-45-6789"; anything that is not 9 digits stays as stored. */
export function formatSsn(ssn: string): string {
  const digits = ssn.replace(/[^0-9]/g, '');
  return digits.length === 9 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : ssn;
}

// '' when nothing is stored; UNREADABLE when the stored value cannot be
// decrypted (one bad record never stops the export).
function reveal(encrypted: unknown): { value: string; included: boolean } {
  if (typeof encrypted !== 'string' || !encrypted) return { value: '', included: false };
  try {
    return { value: decryptField(encrypted), included: true };
  } catch {
    return { value: UNREADABLE, included: false };
  }
}

/**
 * One row per user, sorted by name. `revealedUids` lists everyone whose full
 * SSN or DL# landed in a row: each of them gets a sensitiveAccessLog entry.
 */
export function buildExportRows(
  users: ExportUser[],
  sensitiveByUid: Map<string, ExportSensitive>
): { rows: ExportRow[]; revealedUids: string[] } {
  const revealedUids: string[] = [];
  const rows = users
    .map((user) => ({ user, name: text(user.data.displayName) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
    .map(({ user, name }) => {
      const data = user.data;
      const onFile = sensitiveByUid.get(user.uid) ?? {};
      const ssn = reveal(onFile.ssnEncrypted);
      const dl = reveal(onFile.dlNumberEncrypted);
      if (ssn.included || dl.included) revealedUids.push(user.uid);
      const role = getEffectiveRole({
        role: data.role as PlatformRole | undefined,
        fieldRole: data.fieldRole as FieldRole | undefined,
      });
      return {
        name,
        phone: text(data.phone),
        email: text(data.email),
        street: text(data.address),
        city: text(data.city),
        state: text(data.state),
        zip: text(data.zip),
        shirt: text(data.shirtSize),
        // IBO levels are never named: repFacingRoleLabel leaves them blank.
        role: repFacingRoleLabel(role) ?? '',
        hireDate: installDayKey(data.hireDate) ?? '',
        ssn: ssn.included ? formatSsn(ssn.value) : ssn.value,
        dl: dl.value,
        consent: onFile.backgroundCheckAuth === true ? 'Yes' : onFile.backgroundCheckAuth === false ? 'No' : '',
      };
    });
  return { rows, revealedUids };
}

/** The .xlsx bytes: a bold header row, then one row per person, every cell text. */
export async function buildExportWorkbook(rows: ExportRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Employees', { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = COLUMNS.map((column) => ({ ...column }));
  sheet.getRow(1).font = { bold: true };
  for (const row of rows) sheet.addRow(row);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

/** "3C-employee-data-2026-09-24.xlsx", dated in the business's timezone. */
export function exportFilename(now: Date): string {
  return `3C-employee-data-${installDayKey(now)}.xlsx`;
}
